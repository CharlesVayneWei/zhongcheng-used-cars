import bcrypt from 'bcryptjs';

export function normalizeLoginName(value: string) {
  return value.trim().toLowerCase();
}

export function validLoginName(value: string) {
  return /^[a-z][a-z0-9_-]{2,31}$/.test(value);
}

export function validPassword(value: string) {
  if (value.length < 12 || value.length > 128) return false;
  return /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
}

export function passwordsMatch(first: string, second: string) {
  return first === second;
}

function bcryptRounds() {
  const parsed = Number(process.env.PASSWORD_BCRYPT_ROUNDS ?? '12');
  return Number.isSafeInteger(parsed) && parsed >= 10 && parsed <= 14 ? parsed : 12;
}

export function hashAdminPassword(password: string) {
  return bcrypt.hash(password, bcryptRounds());
}

export function verifyAdminPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export const DUMMY_PASSWORD_HASH = '$2b$12$1VZr0gGsKbXw3dFqM8xCBew7IOAFy2MOzRkB1wiCOi3I6G9s8oT1q';
