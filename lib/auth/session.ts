import 'server-only';

import { cookies } from 'next/headers';
import type { PoolClient } from 'pg';
import { query } from '@/lib/db/pool';
import { createOpaqueToken, hashToken } from '@/lib/security/tokens';
import { ADMIN_SESSION_COOKIE } from '@/lib/auth/constants';

export { ADMIN_SESSION_COOKIE } from '@/lib/auth/constants';

export interface CurrentAdmin {
  id: string;
  login_name: string;
  display_name: string | null;
  session_id: string;
}

function sessionHours() {
  const parsed = Number(process.env.ADMIN_SESSION_HOURS ?? '12');
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 168 ? parsed : 12;
}

function sessionCookie(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires,
  };
}

export async function createAdminSessionRecord(
  client: PoolClient,
  adminId: string,
  metadata: { ipHash: string; userAgent: string | null },
) {
  const token = createOpaqueToken();
  const expires = new Date(Date.now() + sessionHours() * 60 * 60 * 1000);
  await client.query(
    `insert into admin_sessions(admin_id, token_hash, ip_hash, user_agent, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [adminId, hashToken(token), metadata.ipHash, metadata.userAgent, expires],
  );
  return { token, expires };
}

export async function setAdminSessionCookie(session: { token: string; expires: Date }) {
  (await cookies()).set(ADMIN_SESSION_COOKIE, session.token, sessionCookie(session.expires));
}

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token || token.length < 40 || token.length > 128 || !process.env.DATABASE_URL) return null;
  const result = await query<CurrentAdmin>(
    `select a.id, a.login_name, a.display_name, s.id as session_id
       from admin_sessions s
       join admins a on a.id = s.admin_id
      where s.token_hash = $1 and s.expires_at > now() and not a.disabled
      limit 1`,
    [hashToken(token)],
  );
  return result.rows[0] ?? null;
}

export async function revokeCurrentSession() {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  try {
    if (token && process.env.DATABASE_URL) {
      await query('delete from admin_sessions where token_hash = $1', [hashToken(token)]);
    }
  } finally {
    store.set(ADMIN_SESSION_COOKIE, '', { ...sessionCookie(new Date(0)), maxAge: 0 });
  }
}

export async function revokeAllAdminSessions(client: PoolClient, adminId: string) {
  await client.query('delete from admin_sessions where admin_id = $1', [adminId]);
}
