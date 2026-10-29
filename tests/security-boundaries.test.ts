import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/202610180001_initial_schema.sql'), 'utf8');

describe('权限与数据隔离', () => {
  it('公开车辆策略仅允许 published 和 sold', () => {
    expect(migration).toMatch(/public cars read[\s\S]*status in \('published', 'sold'\)/);
    expect(migration).toContain('alter table public.cars enable row level security');
  });

  it('车辆和图片写入策略都要求管理员', () => {
    expect(migration).toMatch(/admins insert cars[\s\S]*public\.is_admin\(\)/);
    expect(migration).toMatch(/admins upload vehicle images[\s\S]*public\.is_admin\(\)/);
  });

  it('高权限密钥没有使用 NEXT_PUBLIC 前缀', () => {
    const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    expect(envExample).toContain('SUPABASE_SERVICE_ROLE_KEY=');
    expect(envExample).not.toContain('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY');
  });

  it('前台没有执行管理员输入的 HTML', () => {
    const files = [
      'app/(public)/cars/[id]/page.tsx',
      'components/cars/car-card.tsx',
    ].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
    expect(files).not.toContain('dangerouslySetInnerHTML');
  });
});
