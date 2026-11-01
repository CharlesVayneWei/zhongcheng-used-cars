import 'server-only';

import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth/session';
import { query } from '@/lib/db/pool';
import { CAR_WITH_IMAGES_SQL, normalizeCarRow } from '@/lib/data/normalize';
import { validUuid } from '@/lib/validation/id';
import type { Car } from '@/lib/types';

export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');
  return { admin };
}

function likePattern(value: string) {
  return `%${value.slice(0, 80).replace(/[\\%_]/g, '\\$&')}%`;
}

export async function listAdminCars(search = '', status = ''): Promise<Car[]> {
  await requireAdmin();
  const values: unknown[] = [];
  const where: string[] = [];
  if (search.trim()) {
    values.push(likePattern(search.trim()));
    where.push(`concat_ws(' ', c.title, c.brand, c.model) ilike $${values.length} escape '\\'`);
  }
  if (['draft', 'published', 'sold', 'archived'].includes(status)) {
    values.push(status);
    where.push(`c.status = $${values.length}::car_status`);
  }
  values.push(200);
  const result = await query<Record<string, unknown>>(
    `${CAR_WITH_IMAGES_SQL}
     ${where.length ? `where ${where.join(' and ')}` : ''}
     order by c.updated_at desc limit $${values.length}`,
    values,
  );
  return result.rows.map(normalizeCarRow);
}

export async function getAdminCar(id: string): Promise<Car | null> {
  await requireAdmin();
  if (!validUuid(id)) return null;
  const result = await query<Record<string, unknown>>(`${CAR_WITH_IMAGES_SQL} where c.id = $1`, [id]);
  return result.rows[0] ? normalizeCarRow(result.rows[0]) : null;
}
