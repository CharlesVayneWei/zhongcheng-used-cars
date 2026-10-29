'use server';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/data/admin';
import { flattenCarErrors, parseCarForm, validateVehicleImage } from '@/lib/validation/car';
import type { ActionState } from '@/lib/types';

function pathsForCar(id: string) {
  revalidatePath('/');
  revalidatePath('/cars');
  revalidatePath(`/cars/${id}`);
  revalidatePath('/admin/cars');
  revalidatePath(`/admin/cars/${id}`);
}

async function audit(
  client: Awaited<ReturnType<typeof requireAdmin>>['client'],
  userId: string,
  action: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
) {
  const { error } = await client.from('admin_audit_logs').insert({
    user_id: userId, action, entity_type: 'car', entity_id: entityId, details,
  });
  if (error) console.error('写入审计日志失败', error);
}

export async function saveCarAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const { client, user } = await requireAdmin();
  const id = String(formData.get('id') ?? '').trim();
  let imageCount = 0;
  let existingPublishedAt: string | null = null;
  if (id) {
    const [{ count }, { data: existingCar }] = await Promise.all([
      client.from('car_images').select('id', { count: 'exact', head: true }).eq('car_id', id),
      client.from('cars').select('published_at').eq('id', id).maybeSingle(),
    ]);
    imageCount = count ?? 0;
    existingPublishedAt = existingCar?.published_at ?? null;
  }
  const result = parseCarForm(formData, imageCount);
  if (!result.success) {
    return { ok: false, message: '请检查表单中的问题。', fieldErrors: flattenCarErrors(result.error) };
  }

  const payload = {
    ...result.data,
    published_at: ['published', 'sold'].includes(result.data.status)
      ? existingPublishedAt ?? new Date().toISOString()
      : null,
    updated_by: user.id,
  };
  if (id) {
    const { error } = await client.from('cars').update(payload).eq('id', id);
    if (error) return { ok: false, message: `保存失败：${error.message}` };
    await audit(client, user.id, 'car.update', id, { status: result.data.status });
    pathsForCar(id);
    return { ok: true, message: '车辆信息已保存。' };
  }

  const { data, error } = await client.from('cars').insert({ ...payload, created_by: user.id }).select('id').single();
  if (error || !data) return { ok: false, message: `创建失败：${error?.message ?? '未返回车辆 ID'}` };
  await audit(client, user.id, 'car.create', data.id, { status: result.data.status });
  pathsForCar(data.id);
  redirect(`/admin/cars/${data.id}?created=1`);
}

export async function uploadCarImageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const { client, user } = await requireAdmin();
  const carId = String(formData.get('carId') ?? '');
  const files = formData.getAll('images').filter((item): item is File => item instanceof File);
  if (!carId || !files.length) return { ok: false, message: '缺少车辆或图片。' };
  if (files.length > 6) return { ok: false, message: '每次最多上传 6 张图片。' };
  for (const file of files) {
    const validationError = validateVehicleImage(file);
    if (validationError) return { ok: false, message: `${file.name}：${validationError}` };
  }
  const { data: car } = await client.from('cars').select('id').eq('id', carId).maybeSingle();
  if (!car) return { ok: false, message: '车辆不存在或无权访问。' };

  const { data: current } = await client.from('car_images').select('sort_order').eq('car_id', carId).order('sort_order', { ascending: false }).limit(1);
  let nextOrder = current?.[0] ? Number(current[0].sort_order) + 1 : 0;
  const { count } = await client.from('car_images').select('id', { count: 'exact', head: true }).eq('car_id', carId);
  let uploaded = 0;
  for (const file of files) {
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const storagePath = `${carId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage.from('car-images').upload(storagePath, file, {
      contentType: file.type, cacheControl: '31536000', upsert: false,
    });
    if (uploadError) return { ok: false, message: `已上传 ${uploaded} 张；${file.name} 上传失败：${uploadError.message}` };
    const { error: insertError } = await client.from('car_images').insert({
      car_id: carId, storage_path: storagePath, sort_order: nextOrder, is_cover: (count ?? 0) + uploaded === 0,
      mime_type: file.type, size_bytes: file.size, created_by: user.id,
    });
    if (insertError) {
      await client.storage.from('car-images').remove([storagePath]);
      return { ok: false, message: `已上传 ${uploaded} 张；${file.name} 的数据库记录创建失败：${insertError.message}` };
    }
    uploaded += 1;
    nextOrder += 1;
  }
  await audit(client, user.id, 'car.image.upload', carId, { count: uploaded });
  pathsForCar(carId);
  return { ok: true, message: `${uploaded} 张图片已上传。` };
}

export async function moveCarImageAction(formData: FormData) {
  const { client, user } = await requireAdmin();
  const carId = String(formData.get('carId') ?? '');
  const imageId = String(formData.get('imageId') ?? '');
  const direction = formData.get('direction') === 'up' ? -1 : 1;
  const { data: images, error } = await client.from('car_images').select('id, sort_order').eq('car_id', carId).order('sort_order');
  if (error || !images) throw new Error(error?.message ?? '读取图片失败');
  const index = images.findIndex((image) => image.id === imageId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= images.length) return;
  const currentOrder = images[index].sort_order;
  const targetOrder = images[target].sort_order;
  const first = await client.from('car_images').update({ sort_order: targetOrder }).eq('id', imageId).eq('car_id', carId);
  if (first.error) throw new Error(first.error.message);
  const second = await client.from('car_images').update({ sort_order: currentOrder }).eq('id', images[target].id).eq('car_id', carId);
  if (second.error) throw new Error(second.error.message);
  await audit(client, user.id, 'car.image.reorder', carId, { imageId, direction });
  pathsForCar(carId);
}

export async function setCoverImageAction(formData: FormData) {
  const { client, user } = await requireAdmin();
  const carId = String(formData.get('carId') ?? '');
  const imageId = String(formData.get('imageId') ?? '');
  const { error } = await client.rpc('set_car_cover_image', { p_car_id: carId, p_image_id: imageId });
  if (error) throw new Error(`设置封面失败：${error.message}`);
  await audit(client, user.id, 'car.image.cover', carId, { imageId });
  pathsForCar(carId);
}

export async function deleteCarImageAction(formData: FormData) {
  const { client, user } = await requireAdmin();
  const carId = String(formData.get('carId') ?? '');
  const imageId = String(formData.get('imageId') ?? '');
  const { data: image, error: readError } = await client.from('car_images').select('*').eq('id', imageId).eq('car_id', carId).maybeSingle();
  if (readError || !image) throw new Error(readError?.message ?? '图片不存在');
  const { error: deleteError } = await client.from('car_images').delete().eq('id', imageId).eq('car_id', carId);
  if (deleteError) throw new Error(deleteError.message);
  const { error: storageError } = await client.storage.from('car-images').remove([image.storage_path]);
  if (storageError) {
    await client.from('storage_cleanup_queue').upsert({ storage_path: image.storage_path, last_error: storageError.message });
  }
  if (image.is_cover) {
    const { data: replacement } = await client.from('car_images').select('id').eq('car_id', carId).order('sort_order').limit(1).maybeSingle();
    if (replacement) await client.rpc('set_car_cover_image', { p_car_id: carId, p_image_id: replacement.id });
  }
  await audit(client, user.id, 'car.image.delete', carId, { imageId, storagePath: image.storage_path });
  pathsForCar(carId);
}

export async function deleteCarAction(formData: FormData) {
  const { client, user } = await requireAdmin();
  const carId = String(formData.get('carId') ?? '');
  const { data: images, error: readError } = await client.from('car_images').select('storage_path').eq('car_id', carId);
  if (readError) throw new Error(readError.message);
  const paths = (images ?? []).map((image) => String(image.storage_path));
  if (paths.length) await client.from('storage_cleanup_queue').upsert(paths.map((storagePath) => ({ storage_path: storagePath })));
  const { error } = await client.rpc('delete_car_record', { p_car_id: carId });
  if (error) throw new Error(`删除车辆失败：${error.message}`);
  if (paths.length) {
    const { error: storageError } = await client.storage.from('car-images').remove(paths);
    if (!storageError) await client.from('storage_cleanup_queue').delete().in('storage_path', paths);
    else await client.from('storage_cleanup_queue').update({ last_error: storageError.message }).in('storage_path', paths);
  }
  await audit(client, user.id, 'car.delete', carId, { imageCount: paths.length });
  pathsForCar(carId);
  redirect('/admin/cars?deleted=1');
}
