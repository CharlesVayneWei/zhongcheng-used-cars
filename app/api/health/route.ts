import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { query } from '@/lib/db/pool';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await query('select 1');
    let release = 'unmanaged';
    try {
      const value = (await readFile(path.join(process.cwd(), '.release-sha'), 'utf8')).trim();
      if (/^[0-9a-f]{40}$/.test(value)) release = value;
    } catch {
      // The health route also works in local development without a release marker.
    }
    return Response.json(
      { ok: true, release },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Health check failed', error);
    return Response.json(
      { ok: false },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
