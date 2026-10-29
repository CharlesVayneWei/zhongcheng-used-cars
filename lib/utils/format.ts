export function formatYuan(value: number | null | undefined) {
  if (value == null) return '价格面议';
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency: 'CNY', maximumFractionDigits: 0,
  }).format(value);
}

export function formatWan(value: number | null | undefined) {
  if (value == null) return '面议';
  return `${(value / 10_000).toFixed(value % 10_000 === 0 ? 0 : 1)}万`;
}

export function formatMileage(value: number | null | undefined) {
  if (value == null) return '—';
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万公里`;
  return `${value.toLocaleString('zh-CN')}公里`;
}

export function formatLocation(province: string | null, city: string | null) {
  return [province, city].filter(Boolean).join(' · ') || '—';
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value));
}
