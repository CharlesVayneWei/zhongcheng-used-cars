import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('缺少 DATABASE_URL');

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();

try {
  await client.query('begin');
  await client.query('select pg_advisory_xact_lock($1)', [82374621]);
  await client.query(`
    create table if not exists schema_migrations (
      name text primary key,
      checksum char(64) not null,
      applied_at timestamptz not null default now()
    )
  `);

  const migrationDir = path.join(process.cwd(), 'database', 'migrations');
  const files = (await fs.readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort();
  const crypto = await import('node:crypto');

  for (const name of files) {
    const sql = await fs.readFile(path.join(migrationDir, name), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const existing = await client.query('select checksum from schema_migrations where name = $1', [name]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`已执行迁移 ${name} 的内容发生变化，请新增迁移文件`);
      console.log(`跳过已执行迁移：${name}`);
      continue;
    }
    await client.query(sql);
    await client.query('insert into schema_migrations(name, checksum) values ($1, $2)', [name, checksum]);
    console.log(`已执行迁移：${name}`);
  }

  await client.query('commit');
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  client.release();
  await pool.end();
}
