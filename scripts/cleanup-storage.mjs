import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), '.data', 'uploads'));
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const safePath = new RegExp(`^${uuid}/${uuid}\\.webp$`);
if (!databaseUrl) throw new Error('缺少 DATABASE_URL');

function resolveStoragePath(storagePath) {
  if (!safePath.test(storagePath)) throw new Error('拒绝不安全的存储路径');
  const absolute = path.resolve(uploadDir, ...storagePath.split('/'));
  const relative = path.relative(uploadDir, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('拒绝目录外路径');
  return absolute;
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  const queued = await pool.query(
    'select storage_path from storage_cleanup_queue order by created_at limit 100',
  );
  let cleaned = 0;
  for (const row of queued.rows) {
    try {
      const absolute = resolveStoragePath(row.storage_path);
      await fs.rm(absolute, { force: true });
      try { await fs.rmdir(path.dirname(absolute)); } catch (error) {
        if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error;
      }
      await pool.query('delete from storage_cleanup_queue where storage_path=$1', [row.storage_path]);
      cleaned += 1;
    } catch (error) {
      await pool.query(
        `update storage_cleanup_queue set attempts=attempts+1,last_error=$2 where storage_path=$1`,
        [row.storage_path, String(error.message || error).slice(0, 1000)],
      );
    }
  }
  console.log(`本次检查 ${queued.rowCount} 项，清理成功 ${cleaned} 项。`);
} finally {
  await pool.end();
}
