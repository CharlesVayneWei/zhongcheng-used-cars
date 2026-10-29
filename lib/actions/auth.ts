'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createHash } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/data/admin';
import { decryptAdminPassword, encryptAdminPassword, normalizeLoginName, passwordsMatch, validLoginName, validPassword, validRecoveryCode } from '@/lib/security/admin-credentials';
import type { ActionState } from '@/lib/types';

export async function loginAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const client = await createSupabaseServerClient();
  if (!client) return { ok: false, message: '尚未配置 Supabase，请先完成环境变量设置。' };
  const loginName = normalizeLoginName(String(formData.get('login_name') ?? ''));
  const password = String(formData.get('password') ?? '');
  if (!validLoginName(loginName) || !password) return { ok: false, message: '请输入账号和密码。' };

  const { data: email, error: lookupError } = await client.rpc('admin_email_for_login', { p_login_name: loginName });
  if (lookupError) return { ok: false, message: '管理员账号尚未初始化，请先执行数据库迁移。' };
  if (!email) return { ok: false, message: '账号或密码错误。' };

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { ok: false, message: '账号或密码错误。' };
  const { data: admin } = await client.from('admin_profiles').select('user_id').eq('user_id', data.user.id).maybeSingle();
  if (!admin) {
    await client.auth.signOut();
    return { ok: false, message: '该账号没有管理员权限。' };
  }
  const ciphertext = encryptAdminPassword(password);
  if (ciphertext) {
    await client.from('admin_password_recovery').upsert({ user_id: data.user.id, ciphertext, updated_at: new Date().toISOString() });
  }
  redirect('/admin/cars');
}

export async function updateAdminCredentialsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const { client, user, profile } = await requireAdmin();
  const loginName = normalizeLoginName(String(formData.get('login_name') ?? ''));
  const currentPassword = String(formData.get('current_password') ?? '');
  const newPassword = String(formData.get('new_password') ?? '');
  const confirmPassword = String(formData.get('confirm_password') ?? '');
  if (!validLoginName(loginName)) return { ok: false, message: '账号需为 3 至 32 位小写字母、数字、下划线或连字符，并以字母开头。' };
  if (!currentPassword) return { ok: false, message: '请输入当前密码，完成修改前验证。' };
  if (!newPassword && !confirmPassword && loginName === profile.login_name) return { ok: false, message: '请修改账号或填写新密码。' };
  if (!passwordsMatch(newPassword, confirmPassword)) return { ok: false, message: '第二次输入失败，请重新修改密码。' };
  if (newPassword && !validPassword(newPassword)) return { ok: false, message: '新密码需为 12 至 128 个字符。' };
  if (!user.email) return { ok: false, message: '管理员邮箱不可用，请联系维护人员。' };
  const ciphertext = newPassword ? encryptAdminPassword(newPassword) : null;
  if (newPassword && !ciphertext) return { ok: false, message: '密码找回加密密钥尚未配置，请联系维护人员。' };

  const { data: verified, error: verifyError } = await client.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (verifyError || verified.user?.id !== user.id) return { ok: false, message: '当前密码验证失败。' };

  const oldLoginName = profile.login_name;
  if (loginName !== oldLoginName) {
    const { error: nameError } = await client.from('admin_profiles').update({ login_name: loginName }).eq('user_id', user.id);
    if (nameError) return { ok: false, message: nameError.code === '23505' ? '该账号已被使用，请换一个账号。' : '账号修改失败，请稍后重试。' };
  }
  if (newPassword) {
    const { error: passwordError } = await client.auth.updateUser({ password: newPassword });
    if (passwordError) {
      if (loginName !== oldLoginName) await client.from('admin_profiles').update({ login_name: oldLoginName }).eq('user_id', user.id);
      return { ok: false, message: '密码修改失败，请稍后重试。' };
    }
    const { error: vaultError } = await client.from('admin_password_recovery').upsert({ user_id: user.id, ciphertext: ciphertext!, updated_at: new Date().toISOString() });
    if (vaultError) return { ok: false, message: '密码已修改，但密码找回记录保存失败。请使用新密码重新登录并重试。' };
  }

  const { data: secondVerification, error: secondVerificationError } = await client.auth.signInWithPassword({ email: user.email, password: newPassword || currentPassword });
  if (secondVerificationError || secondVerification.user?.id !== user.id) return { ok: false, message: '修改已提交，但修改后的二次验证失败。请用新账号和密码重新登录。' };
  await client.from('admin_audit_logs').insert({ user_id: user.id, action: 'admin.credentials.update', entity_type: 'admin_profiles', entity_id: user.id, details: { login_name_changed: loginName !== oldLoginName, password_changed: Boolean(newPassword) } });
  await client.auth.signOut();
  redirect('/admin/login?changed=1');
}

export type RecoveryState = ActionState & { password?: string };

export async function recoverAdminPasswordAction(_previous: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const loginName = normalizeLoginName(String(formData.get('login_name') ?? ''));
  const code = String(formData.get('recovery_code') ?? '');
  if (!validLoginName(loginName) || !code) return { ok: false, message: '请输入管理员账号和找回口令。' };
  const client = await createSupabaseServerClient();
  if (!client) return { ok: false, message: '尚未配置管理员服务。' };
  const requestHeaders = await headers();
  const ip = requestHeaders.get('x-real-ip') || requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const fingerprint = createHash('sha256').update(`${ip}:${loginName}`).digest('hex');
  const { data: allowed, error: limitError } = await client.rpc('allow_admin_recovery_attempt', { p_fingerprint: fingerprint });
  if (limitError) return { ok: false, message: '密码找回功能尚未初始化，请先执行数据库迁移。' };
  if (!allowed) return { ok: false, message: '尝试次数过多，请 15 分钟后再试。' };
  if (!validRecoveryCode(code)) return { ok: false, message: '找回口令错误。' };
  const { data: ciphertext, error } = await client.rpc('admin_recovery_ciphertext', { p_login_name: loginName });
  if (error || !ciphertext) return { ok: false, message: '尚无可找回的密码，请先用该账号成功登录一次。' };
  const password = decryptAdminPassword(ciphertext);
  if (!password) return { ok: false, message: '密码记录无法解密，请联系维护人员。' };
  return { ok: true, message: '验证成功，当前密码如下。', password };
}

export async function logoutAction() {
  const client = await createSupabaseServerClient();
  if (client) await client.auth.signOut();
  redirect('/admin/login');
}
