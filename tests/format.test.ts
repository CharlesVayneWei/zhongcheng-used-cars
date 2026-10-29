import { describe, expect, it } from 'vitest';
import { formatMileage, formatWan, formatYuan } from '@/lib/utils/format';

describe('车辆展示格式', () => {
  it('人民币按数值格式化', () => {
    expect(formatYuan(318000)).toContain('318,000');
    expect(formatWan(318000)).toBe('31.8万');
  });

  it('里程自动转换为万公里', () => {
    expect(formatMileage(28600)).toBe('2.9万公里');
  });
});
