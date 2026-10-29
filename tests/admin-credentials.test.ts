import { afterEach, describe, expect, it, vi } from 'vitest';
import { decryptAdminPassword, encryptAdminPassword, normalizeLoginName, passwordsMatch, validLoginName, validRecoveryCode } from '../lib/security/admin-credentials';

afterEach(() => vi.unstubAllEnvs());

describe('管理员凭据', () => {
  it('规范化登录名，并拒绝不合规账号', () => {
    expect(normalizeLoginName('  WeiLing ')).toBe('weiling');
    expect(validLoginName('weiling')).toBe(true);
    expect(validLoginName('a')).toBe(false);
    expect(validLoginName('name@example.com')).toBe(false);
  });

  it('第二次密码不一致时不会通过', () => {
    expect(passwordsMatch('Weiling987100', 'Weiling987101')).toBe(false);
  });

  it('加密副本需密钥，篡改后不能解密', () => {
    vi.stubEnv('ADMIN_RECOVERY_ENCRYPTION_KEY', '');
    expect(encryptAdminPassword('Weiling987100')).toBeNull();
    vi.stubEnv('ADMIN_RECOVERY_ENCRYPTION_KEY', 'long-independent-server-secret-1234567890');
    const ciphertext = encryptAdminPassword('Weiling987100');
    expect(ciphertext).toBeTruthy();
    expect(ciphertext).not.toContain('Weiling987100');
    expect(decryptAdminPassword(ciphertext!)).toBe('Weiling987100');
    const [iv, tag, content] = ciphertext!.split('.');
    expect(decryptAdminPassword(`${iv}.${tag}.${content[0] === 'A' ? 'B' : 'A'}${content.slice(1)}`)).toBeNull();
    vi.stubEnv('ADMIN_RECOVERY_ENCRYPTION_KEY', 'different-independent-server-secret-1234');
    expect(decryptAdminPassword(ciphertext!)).toBeNull();
  });

  it('找回口令只接受完整匹配', () => {
    vi.stubEnv('ADMIN_RECOVERY_CODE', '858607');
    expect(validRecoveryCode('858607')).toBe(true);
    expect(validRecoveryCode('85860')).toBe(false);
    expect(validRecoveryCode('858608')).toBe(false);
  });
});
