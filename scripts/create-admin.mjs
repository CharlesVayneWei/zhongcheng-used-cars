import process from 'node:process';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_DISPLAY_NAME || '管理员';
const loginName = (process.env.ADMIN_LOGIN_NAME || 'weiling').trim().toLowerCase();
const rounds = Number(process.env.PASSWORD_BCRYPT_ROUNDS || '12');

if (!databaseUrl || !password) throw new Error('缺少 DATABASE_URL 或 ADMIN_PASSWORD');
if (!/^[a-z][a-z0-9_-]{2,31}$/.test(loginName)) throw new Error('ADMIN_LOGIN_NAME 格式无效');
if (password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
  throw new Error('ADMIN_PASSWORD 需为 12 至 128 位，并同时包含大写字母、小写字母和数字');
}
if (!Number.isSafeInteger(rounds) || rounds < 10 || rounds > 14) throw new Error('PASSWORD_BCRYPT_ROUNDS 必须为 10 到 14');

const passwordHash = await bcrypt.hash(password, rounds);
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();

try {
  await client.query('begin');
  const existing = await client.query(
    'select id, disabled from admins where lower(login_name) = $1 for update',
    [loginName],
  );
  let id;
  let mode;
  if (existing.rows[0]) {
    if (!existing.rows[0].disabled) throw new Error(`管理员账号 ${loginName} 已存在且处于启用状态`);
    id = existing.rows[0].id;
    await client.query(
      `update admins set password_hash = $1, display_name = $2, disabled = false,
       password_changed_at = now() where id = $3`,
      [passwordHash, displayName, id],
    );
    mode = '已激活迁移账号';
  } else {
    const inserted = await client.query(
      `insert into admins(login_name, display_name, password_hash) values ($1, $2, $3) returning id`,
      [loginName, displayName, passwordHash],
    );
    id = inserted.rows[0].id;
    mode = '已创建';
  }
  await client.query(
    `insert into admin_audit_logs(user_id, action, entity_type, entity_id, details)
     values ($1, 'admin.create_or_activate', 'admins', $1, $2)`,
    [id, { mode }],
  );
  await client.query('commit');
  console.log(`${mode}管理员：${loginName}`);
  console.log('请立即从环境文件或 shell 历史中移除 ADMIN_PASSWORD。');
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  client.release();
  await pool.end();
}
