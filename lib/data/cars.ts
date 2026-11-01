import 'server-only';

import { query } from '@/lib/db/pool';
import { demoCars } from '@/lib/demo-data';
import { hasDatabaseConfig, isDemoMode } from '@/lib/config';
import { normalizeCarRow } from '@/lib/data/normalize';
import { validUuid } from '@/lib/validation/id';
import type { Car, CarSearchFilters, CarSearchResult } from '@/lib/types';

function filterDemoCars(filters: CarSearchFilters): CarSearchResult {
  const q = filters.q?.toLocaleLowerCase('zh-CN');
  let cars = demoCars.filter((car) => {
    if (!['published', 'sold'].includes(car.status)) return false;
    if (q && !`${car.title} ${car.brand} ${car.model}`.toLocaleLowerCase('zh-CN').includes(q)) return false;
    if (filters.brand && car.brand !== filters.brand) return false;
    if (filters.minPrice && (car.cash_price_yuan ?? 0) < filters.minPrice) return false;
    if (filters.maxPrice && (car.cash_price_yuan ?? Infinity) > filters.maxPrice) return false;
    if (filters.yearFrom && (car.registration_year ?? 0) < filters.yearFrom) return false;
    if (filters.yearTo && (car.registration_year ?? Infinity) > filters.yearTo) return false;
    if (filters.mileageMax && (car.mileage_km ?? Infinity) > filters.mileageMax) return false;
    return true;
  });
  cars = [...cars].sort((a, b) => {
    if (a.status === 'sold' && b.status !== 'sold') return 1;
    if (b.status === 'sold' && a.status !== 'sold') return -1;
    if (filters.sort === 'price_asc') return (a.cash_price_yuan ?? Infinity) - (b.cash_price_yuan ?? Infinity);
    if (filters.sort === 'price_desc') return (b.cash_price_yuan ?? -1) - (a.cash_price_yuan ?? -1);
    return new Date(b.published_at ?? b.created_at).getTime() - new Date(a.published_at ?? a.created_at).getTime();
  });
  const page = Math.max(filters.page ?? 1, 1);
  const pageSize = filters.pageSize ?? 12;
  return { cars: cars.slice((page - 1) * pageSize, page * pageSize), count: cars.length, page, pageSize };
}

function likePattern(value: string) {
  return `%${value.slice(0, 80).replace(/[\\%_]/g, '\\$&')}%`;
}

export async function searchPublicCars(filters: CarSearchFilters = {}): Promise<CarSearchResult> {
  if (isDemoMode) return filterDemoCars(filters);
  const page = Math.max(filters.page ?? 1, 1);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 12, 1), 48);
  if (!hasDatabaseConfig()) return { cars: [], count: 0, page, pageSize };

  const values: unknown[] = [];
  const where = [`c.status in ('published', 'sold')`];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    where.push(sql.replace('?', `$${values.length}`));
  };
  if (filters.q?.trim()) add(`concat_ws(' ', c.title, c.brand, c.model) ilike ? escape '\\'`, likePattern(filters.q.trim()));
  if (filters.brand) add('c.brand = ?', filters.brand.slice(0, 80));
  if (filters.minPrice != null) add('c.cash_price_yuan >= ?', filters.minPrice);
  if (filters.maxPrice != null) add('c.cash_price_yuan <= ?', filters.maxPrice);
  if (filters.yearFrom != null) add('c.registration_year >= ?', filters.yearFrom);
  if (filters.yearTo != null) add('c.registration_year <= ?', filters.yearTo);
  if (filters.mileageMax != null) add('c.mileage_km <= ?', filters.mileageMax);

  const order = filters.sort === 'price_asc'
    ? 'c.status = \'sold\', c.cash_price_yuan asc nulls last'
    : filters.sort === 'price_desc'
      ? 'c.status = \'sold\', c.cash_price_yuan desc nulls last'
      : 'c.status = \'sold\', c.published_at desc nulls last';
  values.push(pageSize, (page - 1) * pageSize);
  const result = await query<Record<string, unknown> & { total_count: number }>(
    `select c.*, count(*) over() as total_count,
       coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order) from car_images i where i.car_id = c.id), '[]'::jsonb) as car_images
       from cars c where ${where.join(' and ')}
       order by ${order} limit $${values.length - 1} offset $${values.length}`,
    values,
  );
  return {
    cars: result.rows.map(normalizeCarRow),
    count: Number(result.rows[0]?.total_count ?? 0),
    page,
    pageSize,
  };
}

export async function getPublicCar(id: string): Promise<Car | null> {
  if (isDemoMode) return demoCars.find((car) => car.id === id && ['published', 'sold'].includes(car.status)) ?? null;
  if (!hasDatabaseConfig() || !validUuid(id)) return null;
  const result = await query<Record<string, unknown>>(
    `select c.*,
       coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order) from car_images i where i.car_id = c.id), '[]'::jsonb) as car_images
       from cars c where c.id = $1 and c.status in ('published', 'sold')`,
    [id],
  );
  return result.rows[0] ? normalizeCarRow(result.rows[0]) : null;
}

export async function getLatestCars(limit = 6) {
  const result = await searchPublicCars({ page: 1, pageSize: limit, sort: 'latest' });
  return result.cars.filter((car) => car.status === 'published').slice(0, limit);
}

export async function getPublicBrands() {
  if (isDemoMode) return [...new Set(demoCars.map((car) => car.brand).filter(Boolean))] as string[];
  if (!hasDatabaseConfig()) return [];
  const result = await query<{ brand: string }>(
    `select distinct brand from cars where status in ('published', 'sold') and brand is not null order by brand limit 500`,
  );
  return result.rows.map((row) => row.brand);
}

export function dataSourceState() {
  return { demo: isDemoMode, configured: hasDatabaseConfig() };
}
