import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';

const databaseUrl = process.env.TEST_DATABASE_URL;

function testDatabaseSafetyError(
  value: string | undefined,
  productionUrl = process.env.DATABASE_URL,
  nodeEnv = process.env.NODE_ENV,
) {
  if (!value) return null;
  if (nodeEnv === 'production') return '生产 NODE_ENV 下禁止运行数据库集成测试';
  if (productionUrl && value === productionUrl) return 'TEST_DATABASE_URL 不得与 DATABASE_URL 相同';
  try {
    const parsed = new URL(value);
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return 'TEST_DATABASE_URL 协议无效';
    if (!/(?:^|[_-])(test|testing|ci)(?:$|[_-])/i.test(databaseName)) {
      return '测试数据库名称必须明确包含 test、testing 或 ci 标识';
    }
  } catch {
    return 'TEST_DATABASE_URL 不是有效的 PostgreSQL URL';
  }
  return null;
}

describe('PostgreSQL 集成测试连接保护', () => {
  const safeUrl = 'postgresql://tester:example@127.0.0.1:5432/zhongcheng_test';

  it('接受独立且明确命名的测试库', () => {
    expect(testDatabaseSafetyError(safeUrl, undefined, 'test')).toBeNull();
  });

  it('拒绝生产库名称、与生产连接相同或生产 NODE_ENV', () => {
    expect(testDatabaseSafetyError('postgresql://tester:example@127.0.0.1:5432/zhongcheng_db', undefined, 'test')).toContain('必须明确包含');
    expect(testDatabaseSafetyError(safeUrl, safeUrl, 'test')).toContain('不得与 DATABASE_URL 相同');
    expect(testDatabaseSafetyError(safeUrl, undefined, 'production')).toContain('生产 NODE_ENV');
  });
});

describe.skipIf(!databaseUrl)('PostgreSQL 16 集成', () => {
  it('覆盖认证状态、车辆 CRUD、公开边界、图片删除和数据约束', async () => {
    const safetyError = testDatabaseSafetyError(databaseUrl);
    if (safetyError) throw new Error(`拒绝连接不安全的测试数据库：${safetyError}`);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const schema = `zc_test_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`create schema "${schema}"`);
      await client.query(`set search_path to "${schema}", public`);
      const migration = await fs.readFile(path.join(process.cwd(), 'database/migrations/001_initial.sql'), 'utf8');
      await client.query(migration);

      const admin = await client.query<{ id: string }>(
        `insert into admins(login_name,display_name,password_hash) values ('tester','测试管理员',$1) returning id`,
        ['$2b$12$1VZr0gGsKbXw3dFqM8xCBew7IOAFy2MOzRkB1wiCOi3I6G9s8oT1q'],
      );
      const adminId = admin.rows[0].id;
      const rawToken = 'session-token-that-never-enters-the-database';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await client.query(
        `insert into admin_sessions(admin_id,token_hash,expires_at) values ($1,$2,now()+interval '1 hour')`,
        [adminId, tokenHash],
      );
      const stored = await client.query('select token_hash from admin_sessions');
      expect(stored.rows[0].token_hash).toBe(tokenHash);
      expect(stored.rows[0].token_hash).not.toContain(rawToken);

      const allowed = [];
      for (let index = 0; index < 6; index += 1) {
        const result = await client.query<{ value: boolean }>(
          `select consume_auth_attempt('login',$1,5,interval '15 minutes') as value`,
          ['a'.repeat(64)],
        );
        allowed.push(result.rows[0].value);
      }
      expect(allowed).toEqual([true, true, true, true, true, false]);

      const car = await client.query<{ id: string }>(
        `insert into cars(title,status,created_by,updated_by) values ('草稿车','draft',$1,$1) returning id`,
        [adminId],
      );
      const carId = car.rows[0].id;
      await expect(client.query(
        `update cars set title='测试车',brand='宝马',model='530Li',registration_year=2022,
         registration_province='浙江',registration_city='杭州',mileage_km=10000,cash_price_yuan=300000,
         condition_description='车况良好',status='published' where id=$1`,
        [carId],
      )).rejects.toThrow();

      const imageId = randomUUID();
      await client.query(
        `insert into car_images(id,car_id,storage_path,sort_order,is_cover,mime_type,size_bytes,created_by)
         values ($1,$2,$3,0,true,'image/webp',100,$4)`,
        [imageId, carId, `${carId}/${imageId}.webp`, adminId],
      );
      await client.query(
        `update cars set title='测试车',brand='宝马',model='530Li',registration_year=2022,
         registration_province='浙江',registration_city='杭州',mileage_km=10000,cash_price_yuan=300000,
         condition_description='车况良好',status='published',published_at=now() where id=$1`,
        [carId],
      );
      await client.query(`insert into cars(title,status,created_by,updated_by) values ('隐藏草稿','draft',$1,$1)`, [adminId]);
      const publicRows = await client.query(`select title from cars where status in ('published','sold')`);
      expect(publicRows.rows.map((row) => row.title)).toEqual(['测试车']);
      await expect(client.query('delete from car_images where id=$1', [imageId])).rejects.toThrow();

      await client.query(`update cars set cash_price_yuan=288000 where id=$1`, [carId]);
      expect((await client.query('select cash_price_yuan from cars where id=$1', [carId])).rows[0].cash_price_yuan).toBe('288000');
      await client.query(`update cars set status='archived' where id=$1`, [carId]);
      await client.query('delete from cars where id=$1', [carId]);
      expect((await client.query('select count(*)::integer as value from car_images where car_id=$1', [carId])).rows[0].value).toBe(0);
    } finally {
      await client.query(`drop schema if exists "${schema}" cascade`);
      client.release();
      await pool.end();
    }
  }, 30_000);
});
