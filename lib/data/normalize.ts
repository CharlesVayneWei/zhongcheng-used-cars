import type { Car, CarImage } from '@/lib/types';

function iso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return value == null ? null : String(value);
}

export function normalizeCarRow(row: Record<string, unknown>): Car {
  const images = ((row.car_images as Array<Record<string, unknown>> | null) ?? []).map((image) => ({
    ...image,
    size_bytes: image.size_bytes == null ? null : Number(image.size_bytes),
    created_at: iso(image.created_at) ?? '',
    public_url: `/media/cars/${String(image.storage_path).split('/').map(encodeURIComponent).join('/')}`,
  } as CarImage));
  return {
    ...row,
    mileage_km: row.mileage_km == null ? null : Number(row.mileage_km),
    cash_price_yuan: row.cash_price_yuan == null ? null : Number(row.cash_price_yuan),
    installment_price_yuan: row.installment_price_yuan == null ? null : Number(row.installment_price_yuan),
    down_payment_yuan: row.down_payment_yuan == null ? null : Number(row.down_payment_yuan),
    created_at: iso(row.created_at) ?? '',
    updated_at: iso(row.updated_at) ?? '',
    published_at: iso(row.published_at),
    insurance_expiry: iso(row.insurance_expiry),
    car_images: images.sort((a, b) => a.sort_order - b.sort_order),
  } as unknown as Car;
}

export const CAR_WITH_IMAGES_SQL = `
  select c.*,
    coalesce((
      select jsonb_agg(to_jsonb(i) order by i.sort_order)
      from car_images i where i.car_id = c.id
    ), '[]'::jsonb) as car_images
  from cars c`;
