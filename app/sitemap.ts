import type { MetadataRoute } from 'next';
import { searchPublicCars } from '@/lib/data/cars';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const { cars } = await searchPublicCars({ page: 1, pageSize: 48 });
  return [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/cars`, changeFrequency: 'daily', priority: .9 },
    ...cars.map((car) => ({ url: `${base}/cars/${car.id}`, lastModified: new Date(car.updated_at), changeFrequency: 'weekly' as const, priority: .7 })),
  ];
}
