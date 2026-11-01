'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { QueryResultRow } from 'pg';
import { requestMetadata } from '@/lib/auth/request';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionRecord,
  revokeAllAdminSessions,
  revokeCurrentSession,
  setAdminSessionCookie,
} from '@/lib/auth/session';
import { query, withTransaction } from '@/lib/db/pool';
import { requireAdmin } from '@/lib/data/admin';
import {
  DUMMY_PASSWORD_HASH,
  hashAdminPassword,
  normalizeLoginName,
  passwordsMatch,
  validLoginName,
  validPassword,
  verifyAdminPassword,
} from '@/lib/security/admin-credentials';
import { hashToken } from '@/lib/security/tokens';
import type { ActionState } from '@/lib/types';

interface AdminAuthRow extends QueryResultRow {
  id: string;
  password_hash: string;
  disabled: boolean;
}

type RateLimitScope = 'login' | 'login_ip' | 'password_reset' | 'password_reset_ip';

async function consumeAttempt(scope: RateLimitScope, fingerprint: string, maxAttempts: number) {
  const result = await query<{ allowed: boolean }>(
    'select consume_auth_attempt($1, $2, $3, $4::interval) as allowed',
    [scope, fingerprint, maxAttempts, '15 minutes'],
  );
  return result.rows[0]?.allowed === true;
}

export async function loginAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (!process.env.DATABASE_URL) return { ok: false, message: '数据库尚未配置，请联系维护人员。' };
  const loginName = normalizeLoginName(String(formData.get('login_name') ?? ''));
  const password = String(formData.get('password') ?? '');
  if (!validLoginName(loginName) || !password) return { ok: false, message: '请输入账号和密码。' };

  const metadata = await requestMetadata(loginName);
  const [accountAllowed, ipAllowed] = await Promise.all([
    consumeAttempt('login', metadata.authFingerprint, 5),
    consumeAttempt('login_ip', metadata.ipHash, 30),
  ]);
  if (!accountAllowed || !ipAllowed) {
    return { ok: false, message: '登录尝试次数过多，请 15 分钟后再试。' };
  }

  const found = await query<AdminAuthRow>(
    'select id, password_hash, disabled from admins where lower(login_name) = $1 limit 1',
    [loginName],
  );
  const admin = found.rows[0];
  const passwordMatches = await verifyAdminPassword(password, admin?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!admin || admin.disabled || !passwordMatches) return { ok: false, message: '账号或密码错误。' };

  const session = await withTransaction(async (client) => {
    await client.query('delete from auth_rate_limits where scope = $1 and fingerprint = $2', ['login', metadata.authFingerprint]);
    await client.query('delete from auth_rate_limits where scope = $1 and fingerprint = $2', ['login_ip', metadata.ipHash]);
    await client.query('delete from admin_sessions where expires_at <= now()');
    const created = await createAdminSessionRecord(client, admin.id, metadata);
    await client.query(
      `insert into admin_audit_logs(user_id, action, entity_type, entity_id, details)
       values ($1, 'admin.login', 'admins', $1, $2)`,
      [admin.id, { ip_hash: metadata.ipHash }],
    );
    return created;
  });
  await setAdminSessionCookie(session);
  redirect('/admin/cars');
}

export async function updateAdminCredentialsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const { admin } = await requireAdmin();
  const loginName = normalizeLoginName(String(formData.get('login_name') ?? ''));
  const currentPassword = String(formData.get('current_password') ?? '');
  const newPassword = String(formData.get('new_password') ?? '');
  const confirmPassword = String(formData.get('confirm_password') ?? '');
  if (!validLoginName(loginName)) return { ok: false, message: '账号需为 3 至 32 位小写字母、数字、下划线或连字符，并以字母开头。' };
  if (!currentPassword) return { ok: false, message: '请输入当前密码，完成修改前验证。' };
  if (!newPassword && !confirmPassword && loginName === admin.login_name) return { ok: false, message: '请修改账号或填写新密码。' };
  if (!passwordsMatch(newPassword, confirmPassword)) return { ok: false, message: '两次输入的新密码不一致。' };
  if (newPassword && !validPassword(newPassword)) return { ok: false, message: '新密码需为 12 至 128 位，并同时包含大写字母、小写字母和数字。' };

  const current = await query<{ password_hash: string }>('select password_hash from admins where id = $1 and not disabled', [admin.id]);
  if (!current.rows[0] || !(await verifyAdminPassword(currentPassword, current.rows[0].password_hash))) {
    return { ok: false, message: '当前密码验证失败。' };
  }
  const passwordHash = newPassword ? await hashAdminPassword(newPassword) : null;

  try {
    await withTransaction(async (client) => {
      const locked = await client.query<{ password_hash: string }>(
        'select password_hash from admins where id = $1 and not disabled for update',
        [admin.id],
      );
      if (!locked.rows[0] || locked.rows[0].password_hash !== current.rows[0].password_hash) {
        throw new Error('credentials_changed');
      }
      await client.query(
        `update admins set login_name = $1,
             password_hash = coalesce($2, password_hash),
             password_changed_at = case when $2::text is null then password_changed_at else now() end
         where id = $3`,
        [loginName, passwordHash, admin.id],
      );
      if (passwordHash) await client.query('delete from admin_password_reset_tokens where admin_id = $1', [admin.id]);
      await revokeAllAdminSessions(client, admin.id);
      await client.query(
        `insert into admin_audit_logs(user_id, action, entity_type, entity_id, details)
         values ($1, 'admin.credentials.update', 'admins', $1, $2)`,
        [admin.id, { login_name_changed: loginName !== admin.login_name, password_changed: Boolean(passwordHash) }],
      );
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return { ok: false, message: '该账号已被使用，请换一个账号。' };
    if (error instanceof Error && error.message === 'credentials_changed') return { ok: false, message: '账号状态已变化，请重新登录后再试。' };
    throw error;
  }

  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  redirect('/admin/login?changed=1');
}

export async function resetAdminPasswordAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (!process.env.DATABASE_URL) return { ok: false, message: '数据库尚未配置，请联系维护人员。' };
  const loginName = normalizeLoginName(String(formData.get('login_name') ?? ''));
  const token = String(formData.get('reset_token') ?? '').trim();
  const newPassword = String(formData.get('new_password') ?? '');
  const confirmPassword = String(formData.get('confirm_password') ?? '');
  if (!validLoginName(loginName) || token.length < 40) return { ok: false, message: '账号或重置令牌无效。' };
  if (!passwordsMatch(newPassword, confirmPassword)) return { ok: false, message: '两次输入的新密码不一致。' };
  if (!validPassword(newPassword)) return { ok: false, message: '新密码需为 12 至 128 位，并同时包含大写字母、小写字母和数字。' };

  const metadata = await requestMetadata(loginName);
  const [accountAllowed, ipAllowed] = await Promise.all([
    consumeAttempt('password_reset', metadata.authFingerprint, 5),
    consumeAttempt('password_reset_ip', metadata.ipHash, 20),
  ]);
  if (!accountAllowed || !ipAllowed) {
    return { ok: false, message: '尝试次数过多，请 15 分钟后再试。' };
  }
  const passwordHash = await hashAdminPassword(newPassword);
  const reset = await withTransaction(async (client) => {
    const found = await client.query<{ token_id: string; admin_id: string }>(
      `select t.id as token_id, a.id as admin_id
         from admin_password_reset_tokens t
         join admins a on a.id = t.admin_id
        where lower(a.login_name) = $1 and t.token_hash = $2
          and t.used_at is null and t.expires_at > now() and not a.disabled
        for update of t`,
      [loginName, hashToken(token)],
    );
    const row = found.rows[0];
    if (!row) return false;
    await client.query('update admins set password_hash = $1, password_changed_at = now() where id = $2', [passwordHash, row.admin_id]);
    await client.query('update admin_password_reset_tokens set used_at = now() where id = $1', [row.token_id]);
    await revokeAllAdminSessions(client, row.admin_id);
    await client.query('delete from auth_rate_limits where scope = $1 and fingerprint = $2', ['password_reset', metadata.authFingerprint]);
    await client.query('delete from auth_rate_limits where scope = $1 and fingerprint = $2', ['password_reset_ip', metadata.ipHash]);
    await client.query(
      `insert into admin_audit_logs(user_id, action, entity_type, entity_id, details)
       values ($1, 'admin.password.reset', 'admins', $1, $2)`,
      [row.admin_id, { ip_hash: metadata.ipHash }],
    );
    return true;
  });
  if (!reset) return { ok: false, message: '账号或重置令牌无效，令牌也可能已经过期或使用过。' };
  redirect('/admin/login?reset=1');
}

export async function logoutAction() {
  await revokeCurrentSession();
  redirect('/admin/login');
}
