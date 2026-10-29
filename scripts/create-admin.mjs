import { createClient } from '@supabase/supabase-js';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_DISPLAY_NAME || '管理员';
const loginName = (process.env.ADMIN_LOGIN_NAME || 'weiling').trim().toLowerCase();
const recoveryKey = process.env.ADMIN_RECOVERY_ENCRYPTION_KEY;

if (!url || !serviceRoleKey || !email || !password || !recoveryKey || recoveryKey.length < 32 || recoveryKey.startsWith('replace-with-')) {
  throw new Error('缺少 NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、ADMIN_EMAIL、ADMIN_PASSWORD 或至少 32 位的 ADMIN_RECOVERY_ENCRYPTION_KEY');
}
if (password.length < 12) throw new Error('管理员初始密码至少需要 12 个字符');
if (!/^[a-z][a-z0-9_-]{2,31}$/.test(loginName)) throw new Error('ADMIN_LOGIN_NAME 格式无效');

const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(recoveryKey).digest(), iv);
const content = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
const ciphertext = [iv, cipher.getAuthTag(), content].map((part) => part.toString('base64url')).join('.');

const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
const { error: profileError } = await client.from('admin_profiles').insert({ user_id: data.user.id, display_name: displayName, login_name: loginName });
if (profileError) {
  await client.auth.admin.deleteUser(data.user.id);
  throw profileError;
}
const { error: recoveryError } = await client.from('admin_password_recovery').insert({ user_id: data.user.id, ciphertext });
if (recoveryError) {
  await client.auth.admin.deleteUser(data.user.id);
  throw recoveryError;
}
console.log(`管理员已创建：${loginName}（${email}）`);
