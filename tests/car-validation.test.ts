import { describe, expect, it } from 'vitest';
import { parseCarForm } from '@/lib/validation/car';

function carForm(overrides: Record<string, string> = {}) {
  const values = {
    title: '宝马 5系 2022款 530Li', brand: '宝马', model: '530Li', registration_year: '2022',
    registration_province: '浙江', registration_city: '杭州', insurance_status: 'insured', insurance_expiry: '2027-01-01',
    mileage_km: '28000', cash_price_yuan: '318000', installment_price_yuan: '302000', down_payment_yuan: '88000',
    condition_description: '原版原漆\n4S 店保养', status: 'published', ...overrides,
  };
  const form = new FormData();
  Object.entries(values).forEach(([key, value]) => form.set(key, value));
  return form;
}

describe('车辆服务端校验', () => {
  it('草稿允许字段不完整', () => {
    expect(parseCarForm(carForm({ status: 'draft', title: '', cash_price_yuan: '' }), 0).success).toBe(true);
  });

  it('发布要求完整字段和至少一张图片', () => {
    const noImage = parseCarForm(carForm(), 0);
    expect(noImage.success).toBe(false);
    if (!noImage.success) {
      const errors = noImage.error.flatten().fieldErrors as Record<string, string[]>;
      expect(errors.images).toContain('发布前至少上传一张车辆图片');
    }
    expect(parseCarForm(carForm(), 1).success).toBe(true);
  });

  it('拒绝负里程和负价格', () => {
    expect(parseCarForm(carForm({ mileage_km: '-1' }), 1).success).toBe(false);
    expect(parseCarForm(carForm({ cash_price_yuan: '-1' }), 1).success).toBe(false);
  });

  it('有保险必须填写到期日，无保险会清空到期日', () => {
    expect(parseCarForm(carForm({ insurance_expiry: '' }), 1).success).toBe(false);
    const uninsured = parseCarForm(carForm({ insurance_status: 'uninsured', insurance_expiry: '2027-01-01' }), 1);
    expect(uninsured.success).toBe(true);
    if (uninsured.success) expect(uninsured.data.insurance_expiry).toBeNull();
  });

  it('首付不能高于分期价', () => {
    expect(parseCarForm(carForm({ installment_price_yuan: '100000', down_payment_yuan: '100001' }), 1).success).toBe(false);
  });
});
