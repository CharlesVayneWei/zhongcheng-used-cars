import 'server-only';

import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';

types.setTypeParser(20, (value) => Number(value));

declare global {
  var __zhongchengPgPool: Pool | undefined;
}

function poolSize() {
  const parsed = Number(process.env.DB_POOL_MAX ?? '4');
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 10 ? parsed : 4;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('缺少服务端环境变量 DATABASE_URL');
  const pool = new Pool({
    connectionString,
    max: poolSize(),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: process.env.NODE_ENV !== 'production',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });
  pool.on('error', (error) => console.error('PostgreSQL 空闲连接错误', error));
  return pool;
}

export function getPool() {
  if (!globalThis.__zhongchengPgPool) globalThis.__zhongchengPgPool = createPool();
  return globalThis.__zhongchengPgPool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
