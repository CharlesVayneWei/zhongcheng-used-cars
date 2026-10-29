'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/data/admin';
import type { ActionState } from '@/lib/types';

export async function saveSettingsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const { client, user } = await requireAdmin();
  const siteName = String(formData.get('site_name') ?? '').trim();
  const tagline = String(formData.get('tagline') ?? '').trim();
  const phone = String(formData.get('consultation_phone') ?? '').trim() || null;
  const wechat = String(formData.get('consultation_wechat') ?? '').trim() || null;
  if (!siteName || siteName.length > 80) return { ok: false, message: '网站名称必填且不能超过 80 个字符。' };
  if (!tagline || tagline.length > 160) return { ok: false, message: '网站标语必填且不能超过 160 个字符。' };
  const { error } = await client.from('site_settings').update({
    site_name: siteName, tagline, consultation_phone: phone, consultation_wechat: wechat, updated_by: user.id,
  }).eq('id', true);
  if (error) return { ok: false, message: `保存失败：${error.message}` };
  await client.from('admin_audit_logs').insert({ user_id: user.id, action: 'settings.update', entity_type: 'site_settings', details: {} });
  revalidatePath('/', 'layout');
  return { ok: true, message: '网站设置已保存。' };
}
