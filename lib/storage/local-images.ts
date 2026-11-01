import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { MAX_IMAGE_BYTES } from '@/lib/validation/car';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
export const STORAGE_PATH_PATTERN = new RegExp(`^${UUID}/${UUID}\\.webp$`);

export function uploadRoot() {
  if (process.env.UPLOAD_DIR) return path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR);
  return path.join(process.cwd(), '.data', 'uploads');
}

export function resolveImagePath(storagePath: string) {
  if (!STORAGE_PATH_PATTERN.test(storagePath)) throw new Error('invalid_storage_path');
  const root = uploadRoot();
  const absolute = path.resolve(root, ...storagePath.split('/'));
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('invalid_storage_path');
  return absolute;
}

export function detectRasterMime(buffer: Buffer) {
  if (buffer.length >= 12 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export async function prepareVehicleImage(file: File) {
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new Error('图片必须大于 0 且不超过 5 MB');
  const input = Buffer.from(await file.arrayBuffer());
  const detected = detectRasterMime(input);
  if (!detected || detected !== file.type) throw new Error('图片内容与文件类型不符，或不是有效的 JPG、PNG、WEBP');
  const image = sharp(input, { failOn: 'warning', limitInputPixels: 40_000_000 });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error('无法读取图片尺寸');
  const output = await image
    .rotate()
    .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 84, effort: 4 })
    .toBuffer();
  if (!output.length || output.length > MAX_IMAGE_BYTES) throw new Error('图片转换为 WebP 后超过 5 MB');
  return output;
}

export async function writeVehicleImage(storagePath: string, content: Buffer) {
  const absolute = resolveImagePath(storagePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true, mode: 0o750 });
  await fs.writeFile(absolute, content, { flag: 'wx', mode: 0o640 });
}

export async function readVehicleImage(storagePath: string) {
  return fs.readFile(resolveImagePath(storagePath));
}

export async function deleteVehicleImage(storagePath: string) {
  const absolute = resolveImagePath(storagePath);
  try {
    await fs.unlink(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    await fs.rmdir(path.dirname(absolute));
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
  }
}
