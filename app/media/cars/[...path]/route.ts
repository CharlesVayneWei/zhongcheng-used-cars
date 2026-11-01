import { getCurrentAdmin } from '@/lib/auth/session';
import { hasDatabaseConfig } from '@/lib/config';
import { query } from '@/lib/db/pool';
import { readVehicleImage, STORAGE_PATH_PATTERN } from '@/lib/storage/local-images';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!hasDatabaseConfig()) return new Response('Not Found', { status: 404 });
  const segments = (await params).path;
  const storagePath = segments.join('/');
  if (segments.length !== 2 || !STORAGE_PATH_PATTERN.test(storagePath)) return new Response('Not Found', { status: 404 });

  const result = await query<{ status: string }>(
    `select c.status from car_images i join cars c on c.id = i.car_id where i.storage_path = $1`,
    [storagePath],
  );
  const status = result.rows[0]?.status;
  const isPublic = status === 'published' || status === 'sold';
  if (!isPublic && !(await getCurrentAdmin())) return new Response('Not Found', { status: 404 });

  try {
    const content = await readVehicleImage(storagePath);
    return new Response(new Uint8Array(content), {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(content.length),
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': isPublic ? 'public, max-age=31536000, immutable' : 'private, no-store',
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Response('Not Found', { status: 404 });
    throw error;
  }
}
