import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const DEFAULT_ADMIN_RECOVERY_CODE = '858607';

export function normalizeLoginName(value: string) {
  return value.trim().toLowerCase();
}

export function validLoginName(value: string) {
  return /^[a-z][a-z0-9_-]{2,31}$/.test(value);
}

export function validPassword(value: string) {
  return value.length >= 12 && value.length <= 128;
}

export function passwordsMatch(first: string, second: string) {
  return first === second;
}

function encryptionKey() {
  const secret = process.env.ADMIN_RECOVERY_ENCRYPTION_KEY;
  return secret && secret.length >= 32 && !secret.startsWith('replace-with-') ? createHash('sha256').update(secret).digest() : null;
}

export function encryptAdminPassword(password: string) {
  const key = encryptionKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const content = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), content].map((part) => part.toString('base64url')).join('.');
}

export function decryptAdminPassword(value: string) {
  const key = encryptionKey();
  if (!key) return null;
  try {
    const [iv, tag, content] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
    if (!iv || !tag || !content || iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(content), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function validRecoveryCode(candidate: string) {
  const expected = process.env.ADMIN_RECOVERY_CODE || DEFAULT_ADMIN_RECOVERY_CODE;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
