import { createPublicClient } from '@/lib/supabase/public';
import { demoCars } from '@/lib/demo-data';
import { hasSupabaseConfig, isDemoMode } from '@/lib/config';
import type { Car, CarImage, CarSearchFilters, CarSearchResult } from '@/lib/types';

function publicImageUrl(storagePath: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return undefined;
  const encoded = storagePath.split('/').map(encodeURIComponent).join('/');
  return `${base}/storage/v1/object/public/car-images/${encoded}`;
}

function normalizeCar(row: Record<string, unknown>): Car {
  const images = ((row.car_images as Record<string, unknown>[] | null) ?? [])
    .map((image) => ({
      ...image,
      public_url: publicImageUrl(String(image.storage_path)),
    } as CarImage))
    .sort((a, b) => a.sort_order - b.sort_order);
  return { ...row, car_images: images } as unknown as Car;
}

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

export async function searchPublicCars(filters: CarSearchFilters = {}): Promise<CarSearchResult> {
  if (isDemoMode) return filterDemoCars(filters);
  const client = createPublicClient();
  const page = Math.max(filters.page ?? 1, 1);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 12, 1), 48);
  if (!client) return { cars: [], count: 0, page, pageSize };

  let query = client
    .from('cars')
    .select('*, car_images(*)', { count: 'exact' })
    .in('status', ['published', 'sold'])
    .order('status', { ascending: true });
  if (filters.q) {
    const keyword = filters.q.slice(0, 80).replace(/[,()%]/g, ' ').trim();
    if (keyword) query = query.or(`title.ilike.%${keyword}%,brand.ilike.%${keyword}%,model.ilike.%${keyword}%`);
  }
  if (filters.brand) query = query.eq('brand', filters.brand.slice(0, 80));
  if (filters.minPrice != null) query = query.gte('cash_price_yuan', filters.minPrice);
  if (filters.maxPrice != null) query = query.lte('cash_price_yuan', filters.maxPrice);
  if (filters.yearFrom != null) query = query.gte('registration_year', filters.yearFrom);
  if (filters.yearTo != null) query = query.lte('registration_year', filters.yearTo);
  if (filters.mileageMax != null) query = query.lte('mileage_km', filters.mileageMax);

  if (filters.sort === 'price_asc') query = query.order('cash_price_yuan', { ascending: true, nullsFirst: false });
  else if (filters.sort === 'price_desc') query = query.order('cash_price_yuan', { ascending: false, nullsFirst: false });
  else query = query.order('published_at', { ascending: false, nullsFirst: false });

  const from = (page - 1) * pageSize;
  const { data, count, error } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error(`读取车辆列表失败：${error.message}`);
  const cars = (data ?? []).map((row) => normalizeCar(row as Record<string, unknown>))
    .sort((a, b) => Number(a.status === 'sold') - Number(b.status === 'sold'));
  return { cars, count: count ?? 0, page, pageSize };
}

export async function getPublicCar(id: string): Promise<Car | null> {
  if (isDemoMode) return demoCars.find((car) => car.id === id && ['published', 'sold'].includes(car.status)) ?? null;
  const client = createPublicClient();
  if (!client) return null;
  const { data, error } = await client
    .from('cars')
    .select('*, car_images(*)')
    .eq('id', id)
    .in('status', ['published', 'sold'])
    .maybeSingle();
  if (error) throw new Error(`读取车辆详情失败：${error.message}`);
  return data ? normalizeCar(data as Record<string, unknown>) : null;
}

export async function getLatestCars(limit = 6) {
  const result = await searchPublicCars({ page: 1, pageSize: limit, sort: 'latest' });
  return result.cars.filter((car) => car.status === 'published').slice(0, limit);
}

export async function getPublicBrands() {
  if (isDemoMode) return [...new Set(demoCars.map((car) => car.brand).filter(Boolean))] as string[];
  const client = createPublicClient();
  if (!client) return [];
  const { data, error } = await client.from('cars').select('brand').in('status', ['published', 'sold']).not('brand', 'is', null).limit(500);
  if (error) throw new Error(`读取品牌失败：${error.message}`);
  return [...new Set((data ?? []).map((row) => String(row.brand)))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function dataSourceState() {
  return { demo: isDemoMode, configured: hasSupabaseConfig() };
}
