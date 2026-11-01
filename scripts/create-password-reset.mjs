import { createHash, randomBytes } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const loginArg = process.argv.find((value) => value.startsWith('--login='))?.slice('--login='.length);
const loginName = (loginArg || process.env.ADMIN_LOGIN_NAME || '').trim().toLowerCase();
const minutes = Number(process.env.PASSWORD_RESET_MINUTES || '30');
if (!databaseUrl) throw new Error('缺少 DATABASE_URL');
if (!/^[a-z][a-z0-9_-]{2,31}$/.test(loginName)) throw new Error('请设置 ADMIN_LOGIN_NAME 或传入 --login=<账号>');
if (!Number.isSafeInteger(minutes) || minutes < 5 || minutes > 1440) throw new Error('PASSWORD_RESET_MINUTES 必须为 5 到 1440');

const token = randomBytes(32).toString('base64url');
const tokenHash = createHash('sha256').update(token).digest('hex');
const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();

try {
  await client.query('begin');
  const admin = await client.query('select id from admins where lower(login_name) = $1 and not disabled for update', [loginName]);
  if (!admin.rows[0]) throw new Error('找不到已启用的管理员账号');
  await client.query(
    'update admin_password_reset_tokens set used_at = now() where admin_id = $1 and used_at is null',
    [admin.rows[0].id],
  );
  await client.query(
    `insert into admin_password_reset_tokens(admin_id, token_hash, expires_at) values ($1, $2, $3)`,
    [admin.rows[0].id, tokenHash, expiresAt],
  );
  await client.query(
    `insert into admin_audit_logs(user_id, action, entity_type, entity_id, details)
     values ($1, 'admin.password_reset_token.create', 'admins', $1, $2)`,
    [admin.rows[0].id, { expires_at: expiresAt.toISOString() }],
  );
  await client.query('commit');
  console.log(`账号：${loginName}`);
  console.log(`一次性重置令牌（仅显示本次）：${token}`);
  console.log(`失效时间：${expiresAt.toISOString()}`);
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  client.release();
  await pool.end();
}
