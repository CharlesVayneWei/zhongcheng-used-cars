import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, validateVehicleImage } from '@/lib/validation/car';

describe('车辆图片校验', () => {
  it('接受 JPG、PNG、WEBP', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validateVehicleImage(new File(['image'], `test.${type.split('/')[1]}`, { type }))).toBeNull();
    }
  });

  it('拒绝 SVG 和超大文件', () => {
    expect(validateVehicleImage(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }))).toContain('仅支持');
    const huge = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'x.jpg', { type: 'image/jpeg' });
    expect(validateVehicleImage(huge)).toContain('5 MB');
  });
});
