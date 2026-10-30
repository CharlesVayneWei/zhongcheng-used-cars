import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { searchPublicCars } from '@/lib/data/cars';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 车辆索引依赖运行时数据库；构建时不访问尚未初始化的 Supabase。
  await connection();
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const { cars } = await searchPublicCars({ page: 1, pageSize: 48 });
  return [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/cars`, changeFrequency: 'daily', priority: .9 },
    ...cars.map((car) => ({ url: `${base}/cars/${car.id}`, lastModified: new Date(car.updated_at), changeFrequency: 'weekly' as const, priority: .7 })),
  ];
}
