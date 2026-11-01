import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, 'database/migrations/001_initial.sql'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

describe('权限与数据隔离', () => {
  it('运行时不再依赖 Supabase，数据库连接不会暴露给浏览器', () => {
    expect(packageJson.dependencies).not.toHaveProperty('@supabase/supabase-js');
    expect(packageJson.dependencies).not.toHaveProperty('@supabase/ssr');
    expect(packageJson.dependencies).not.toHaveProperty('@opennextjs/cloudflare');
    const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    expect(envExample).toContain('DATABASE_URL=');
    expect(envExample).not.toMatch(/^NEXT_PUBLIC_DATABASE_URL=/m);
  });

  it('CI 使用 Node 24 和独立 PostgreSQL 16 测试库', () => {
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/self-hosted-ci.yml'), 'utf8');
    expect(workflow).toContain('image: postgres:16');
    expect(workflow).toContain('node-version: 24');
    expect(workflow).toContain('zhongcheng_test');
    expect(workflow).not.toContain('build:worker');
  });

  it('数据库包含密码哈希、服务端会话、重置令牌和登录限流', () => {
    expect(migration).toContain('password_hash text not null');
    expect(migration).toContain('create table admin_sessions');
    expect(migration).toContain('create table admin_password_reset_tokens');
    expect(migration).toContain('create table auth_rate_limits');
    expect(migration).not.toContain('ciphertext');
  });

  it('公开查询只允许 published 和 sold，后台写操作逐个要求管理员', () => {
    const publicData = fs.readFileSync(path.join(root, 'lib/data/cars.ts'), 'utf8');
    expect(publicData).toMatch(/status in \('published', 'sold'\)/);
    for (const file of ['lib/actions/cars.ts', 'lib/actions/settings.ts']) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      expect(source).toContain('await requireAdmin()');
    }
  });

  it('车辆完整性由数据库约束和触发器兜底', () => {
    expect(migration).toContain('cars_public_fields_ck');
    expect(migration).toContain('cars_require_image_to_publish');
    expect(migration).toContain('car_images_keep_last_public');
    expect(migration).toContain('car_images_one_cover_per_car');
  });

  it('前台没有执行管理员输入的 HTML', () => {
    const files = ['app/(public)/cars/[id]/page.tsx', 'components/cars/car-card.tsx']
      .map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
    expect(files).not.toContain('dangerouslySetInnerHTML');
  });
});
