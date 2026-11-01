'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { query, withTransaction } from '@/lib/db/pool';
import { writeAudit } from '@/lib/data/audit';
import { requireAdmin } from '@/lib/data/admin';
import { deleteVehicleImage, prepareVehicleImage, writeVehicleImage } from '@/lib/storage/local-images';
import { flattenCarErrors, parseCarForm, validateVehicleImage } from '@/lib/validation/car';
import { validUuid } from '@/lib/validation/id';
import type { ActionState } from '@/lib/types';

const MAX_BATCH_BYTES = 7 * 1024 * 1024;

function pathsForCar(id: string) {
  revalidatePath('/');
  revalidatePath('/cars');
  revalidatePath(`/cars/${id}`);
  revalidatePath('/admin/cars');
  revalidatePath(`/admin/cars/${id}`);
}

async function queueCleanup(storagePath: string, error: unknown) {
  await query(
    `insert into storage_cleanup_queue(storage_path, attempts, last_error)
     values ($1, 1, $2)
     on conflict (storage_path) do update set attempts = storage_cleanup_queue.attempts + 1, last_error = excluded.last_error`,
    [storagePath, error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000)],
  );
}

export async function saveCarAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const { admin } = await requireAdmin();
  const id = String(formData.get('id') ?? '').trim().toLowerCase();
  if (id && !validUuid(id)) return { ok: false, message: '车辆 ID 无效。' };

  const existing = id
    ? await query<{ image_count: number; published_at: Date | null }>(
      `select count(i.id)::integer as image_count, max(c.published_at) as published_at
         from cars c left join car_images i on i.car_id = c.id where c.id = $1 group by c.id`,
      [id],
    )
    : null;
  if (id && !existing?.rows[0]) return { ok: false, message: '车辆不存在或无权访问。' };
  const result = parseCarForm(formData, existing?.rows[0]?.image_count ?? 0);
  if (!result.success) return { ok: false, message: '请检查表单中的问题。', fieldErrors: flattenCarErrors(result.error) };

  const publishedAt = ['published', 'sold'].includes(result.data.status)
    ? existing?.rows[0]?.published_at ?? new Date()
    : null;
  const values = [
    result.data.title, result.data.brand, result.data.model, result.data.registration_year,
    result.data.registration_province, result.data.registration_city, result.data.insurance_status,
    result.data.insurance_expiry, result.data.mileage_km, result.data.cash_price_yuan,
    result.data.installment_price_yuan, result.data.down_payment_yuan, result.data.condition_description,
    result.data.status, publishedAt,
  ];

  if (id) {
    await withTransaction(async (client) => {
      const updated = await client.query(
        `update cars set title=$1, brand=$2, model=$3, registration_year=$4,
           registration_province=$5, registration_city=$6, insurance_status=$7::insurance_status,
           insurance_expiry=$8, mileage_km=$9, cash_price_yuan=$10, installment_price_yuan=$11,
           down_payment_yuan=$12, condition_description=$13, status=$14::car_status,
           published_at=$15, updated_by=$16 where id=$17`,
        [...values, admin.id, id],
      );
      if (!updated.rowCount) throw new Error('车辆不存在');
      await writeAudit(client, admin.id, 'car.update', 'car', id, { status: result.data.status });
    });
    pathsForCar(id);
    return { ok: true, message: '车辆信息已保存。' };
  }

  const carId = await withTransaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `insert into cars(title, brand, model, registration_year, registration_province, registration_city,
         insurance_status, insurance_expiry, mileage_km, cash_price_yuan, installment_price_yuan,
         down_payment_yuan, condition_description, status, published_at, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7::insurance_status,$8,$9,$10,$11,$12,$13,$14::car_status,$15,$16,$16)
       returning id`,
      [...values, admin.id],
    );
    const createdId = inserted.rows[0].id;
    await writeAudit(client, admin.id, 'car.create', 'car', createdId, { status: result.data.status });
    return createdId;
  });
  pathsForCar(carId);
  redirect(`/admin/cars/${carId}?created=1`);
}

export async function uploadCarImageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const { admin } = await requireAdmin();
  const carId = String(formData.get('carId') ?? '').toLowerCase();
  const files = formData.getAll('images').filter((item): item is File => item instanceof File);
  if (!validUuid(carId) || !files.length) return { ok: false, message: '缺少车辆或图片。' };
  if (files.length > 6) return { ok: false, message: '每次最多上传 6 张图片。' };
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES) return { ok: false, message: '本批图片总大小不能超过 7 MB。' };

  const prepared: Array<{ id: string; path: string; content: Buffer }> = [];
  try {
    for (const file of files) {
      const validationError = validateVehicleImage(file);
      if (validationError) return { ok: false, message: `${file.name}：${validationError}` };
      const imageId = randomUUID();
      prepared.push({ id: imageId, path: `${carId}/${imageId}.webp`, content: await prepareVehicleImage(file) });
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '图片处理失败。' };
  }

  const written: string[] = [];
  try {
    await withTransaction(async (client) => {
      const car = await client.query('select id from cars where id = $1 for update', [carId]);
      if (!car.rowCount) throw new Error('车辆不存在或无权访问。');
      const current = await client.query<{ next_order: number; image_count: number }>(
        `select coalesce(max(sort_order), -1)::integer + 1 as next_order, count(*)::integer as image_count
           from car_images where car_id = $1`,
        [carId],
      );
      let nextOrder = current.rows[0].next_order;
      let imageCount = current.rows[0].image_count;
      for (const image of prepared) {
        await writeVehicleImage(image.path, image.content);
        written.push(image.path);
        await client.query(
          `insert into car_images(id, car_id, storage_path, sort_order, is_cover, mime_type, size_bytes, created_by)
           values ($1, $2, $3, $4, $5, 'image/webp', $6, $7)`,
          [image.id, carId, image.path, nextOrder, imageCount === 0, image.content.length, admin.id],
        );
        nextOrder += 1;
        imageCount += 1;
      }
      await writeAudit(client, admin.id, 'car.image.upload', 'car', carId, { count: prepared.length });
    });
  } catch (error) {
    for (const storagePath of written) {
      try { await deleteVehicleImage(storagePath); } catch (cleanupError) { await queueCleanup(storagePath, cleanupError); }
    }
    return { ok: false, message: error instanceof Error ? error.message : '图片上传失败。' };
  }

  pathsForCar(carId);
  return { ok: true, message: `${prepared.length} 张图片已安全转换为 WebP 并上传。` };
}

export async function moveCarImageAction(formData: FormData) {
  const { admin } = await requireAdmin();
  const carId = String(formData.get('carId') ?? '').toLowerCase();
  const imageId = String(formData.get('imageId') ?? '').toLowerCase();
  if (!validUuid(carId) || !validUuid(imageId)) throw new Error('图片参数无效');
  const direction = formData.get('direction') === 'up' ? -1 : 1;
  await withTransaction(async (client) => {
    await client.query('select id from cars where id = $1 for update', [carId]);
    const images = await client.query<{ id: string; sort_order: number }>(
      'select id, sort_order from car_images where car_id = $1 order by sort_order for update',
      [carId],
    );
    const index = images.rows.findIndex((image) => image.id === imageId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= images.rows.length) return;
    await client.query('set constraints car_images_car_sort_unique deferred');
    await client.query(
      `update car_images set sort_order = case when id = $1 then $3 else $4 end
       where car_id = $2 and id in ($1, $5)`,
      [imageId, carId, images.rows[target].sort_order, images.rows[index].sort_order, images.rows[target].id],
    );
    await writeAudit(client, admin.id, 'car.image.reorder', 'car', carId, { imageId, direction });
  });
  pathsForCar(carId);
}

export async function setCoverImageAction(formData: FormData) {
  const { admin } = await requireAdmin();
  const carId = String(formData.get('carId') ?? '').toLowerCase();
  const imageId = String(formData.get('imageId') ?? '').toLowerCase();
  if (!validUuid(carId) || !validUuid(imageId)) throw new Error('图片参数无效');
  await withTransaction(async (client) => {
    await client.query('select id from cars where id = $1 for update', [carId]);
    const image = await client.query('select id from car_images where id = $1 and car_id = $2', [imageId, carId]);
    if (!image.rowCount) throw new Error('图片不存在');
    await client.query('update car_images set is_cover = false where car_id = $1 and is_cover', [carId]);
    await client.query('update car_images set is_cover = true where id = $1 and car_id = $2', [imageId, carId]);
    await writeAudit(client, admin.id, 'car.image.cover', 'car', carId, { imageId });
  });
  pathsForCar(carId);
}

export async function deleteCarImageAction(formData: FormData) {
  const { admin } = await requireAdmin();
  const carId = String(formData.get('carId') ?? '').toLowerCase();
  const imageId = String(formData.get('imageId') ?? '').toLowerCase();
  if (!validUuid(carId) || !validUuid(imageId)) throw new Error('图片参数无效');
  const storagePath = await withTransaction(async (client) => {
    const car = await client.query<{ status: string }>('select status from cars where id = $1 for update', [carId]);
    if (!car.rows[0]) throw new Error('车辆不存在');
    const images = await client.query<{ id: string; storage_path: string; is_cover: boolean }>(
      'select id, storage_path, is_cover from car_images where car_id = $1 order by sort_order for update',
      [carId],
    );
    const image = images.rows.find((item) => item.id === imageId);
    if (!image) throw new Error('图片不存在');
    if (['published', 'sold'].includes(car.rows[0].status) && images.rows.length === 1) throw new Error('在售或已售车辆必须保留至少一张图片');
    await client.query('delete from car_images where id = $1 and car_id = $2', [imageId, carId]);
    if (image.is_cover && images.rows.length > 1) {
      const replacement = images.rows.find((item) => item.id !== imageId)!;
      await client.query('update car_images set is_cover = true where id = $1', [replacement.id]);
    }
    await writeAudit(client, admin.id, 'car.image.delete', 'car', carId, { imageId, storagePath: image.storage_path });
    return image.storage_path;
  });
  try { await deleteVehicleImage(storagePath); } catch (error) { await queueCleanup(storagePath, error); }
  pathsForCar(carId);
}

export async function deleteCarAction(formData: FormData) {
  const { admin } = await requireAdmin();
  const carId = String(formData.get('carId') ?? '').toLowerCase();
  if (!validUuid(carId)) throw new Error('车辆 ID 无效');
  const paths = await withTransaction(async (client) => {
    const car = await client.query('select id from cars where id = $1 for update', [carId]);
    if (!car.rowCount) throw new Error('车辆不存在');
    const images = await client.query<{ storage_path: string }>('select storage_path from car_images where car_id = $1', [carId]);
    await client.query(`update cars set status = 'archived' where id = $1`, [carId]);
    await client.query('delete from cars where id = $1', [carId]);
    await writeAudit(client, admin.id, 'car.delete', 'car', carId, { imageCount: images.rows.length });
    return images.rows.map((image) => image.storage_path);
  });
  for (const storagePath of paths) {
    try { await deleteVehicleImage(storagePath); } catch (error) { await queueCleanup(storagePath, error); }
  }
  pathsForCar(carId);
  redirect('/admin/cars?deleted=1');
}
