import { query } from '@/lib/db/pool';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await query('select 1');
    return Response.json(
      { ok: true, release: process.env.ZC_RELEASE_SHA ?? 'unmanaged' },
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
