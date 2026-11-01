import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hashAdminPassword,
  normalizeLoginName,
  passwordsMatch,
  validLoginName,
  validPassword,
  verifyAdminPassword,
} from '../lib/security/admin-credentials';
import { createOpaqueToken, hashToken, safeEqual } from '../lib/security/tokens';

afterEach(() => vi.unstubAllEnvs());

describe('管理员凭据', () => {
  it('规范化登录名，并拒绝不合规账号', () => {
    expect(normalizeLoginName('  WeiLing ')).toBe('weiling');
    expect(validLoginName('weiling')).toBe(true);
    expect(validLoginName('a')).toBe(false);
    expect(validLoginName('name@example.com')).toBe(false);
  });

  it('要求强密码且两次输入一致', () => {
    expect(validPassword('Short123')).toBe(false);
    expect(validPassword('alllowercase123456')).toBe(false);
    expect(validPassword('StrongPassword123')).toBe(true);
    expect(passwordsMatch('StrongPassword123', 'StrongPassword124')).toBe(false);
  });

  it('只保存不可逆 bcrypt 哈希并能验证密码', async () => {
    vi.stubEnv('PASSWORD_BCRYPT_ROUNDS', '10');
    const password = 'StrongPassword123';
    const hashed = await hashAdminPassword(password);
    expect(hashed).not.toContain(password);
    expect(await verifyAdminPassword(password, hashed)).toBe(true);
    expect(await verifyAdminPassword('WrongPassword123', hashed)).toBe(false);
  });

  it('会话和重置令牌使用高熵随机值与 SHA-256 哈希', () => {
    const token = createOpaqueToken();
    const digest = hashToken(token);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(token);
    expect(safeEqual(digest, hashToken(token))).toBe(true);
    expect(safeEqual(digest, hashToken(`${token}x`))).toBe(false);
  });
});
