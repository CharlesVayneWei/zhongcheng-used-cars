import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteVehicleImage,
  detectRasterMime,
  prepareVehicleImage,
  readVehicleImage,
  resolveImagePath,
  writeVehicleImage,
} from '@/lib/storage/local-images';

let temporaryDirectory: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe('本地车辆图片存储', () => {
  it('服务端重新解码并输出 WebP，且可安全写入和删除', async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'zc-images-'));
    vi.stubEnv('UPLOAD_DIR', temporaryDirectory);
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#c6322b' } }).png().toBuffer();
    const output = await prepareVehicleImage(new File([png], 'vehicle.png', { type: 'image/png' }));
    expect(detectRasterMime(output)).toBe('image/webp');
    const storagePath = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp';
    await writeVehicleImage(storagePath, output);
    expect(await readVehicleImage(storagePath)).toEqual(output);
    await deleteVehicleImage(storagePath);
    await expect(readVehicleImage(storagePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('拒绝 MIME 欺骗和路径遍历', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer();
    await expect(prepareVehicleImage(new File([png], 'fake.jpg', { type: 'image/jpeg' }))).rejects.toThrow('内容与文件类型不符');
    expect(() => resolveImagePath('../outside.webp')).toThrow('invalid_storage_path');
    expect(() => resolveImagePath('11111111-1111-4111-8111-111111111111/run.sh')).toThrow('invalid_storage_path');
  });
});
