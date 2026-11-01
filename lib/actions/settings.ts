'use server';

import { revalidatePath } from 'next/cache';
import { withTransaction } from '@/lib/db/pool';
import { writeAudit } from '@/lib/data/audit';
import { requireAdmin } from '@/lib/data/admin';
import type { ActionState } from '@/lib/types';

export async function saveSettingsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const { admin } = await requireAdmin();
  const siteName = String(formData.get('site_name') ?? '').trim();
  const tagline = String(formData.get('tagline') ?? '').trim();
  const phone = String(formData.get('consultation_phone') ?? '').trim() || null;
  const wechat = String(formData.get('consultation_wechat') ?? '').trim() || null;
  if (!siteName || siteName.length > 80) return { ok: false, message: '网站名称必填且不能超过 80 个字符。' };
  if (!tagline || tagline.length > 160) return { ok: false, message: '网站标语必填且不能超过 160 个字符。' };
  if (phone && phone.length > 40) return { ok: false, message: '联系电话不能超过 40 个字符。' };
  if (wechat && wechat.length > 80) return { ok: false, message: '微信号不能超过 80 个字符。' };
  await withTransaction(async (client) => {
    await client.query(
      `update site_settings set site_name = $1, tagline = $2, consultation_phone = $3,
       consultation_wechat = $4, updated_by = $5 where id = true`,
      [siteName, tagline, phone, wechat, admin.id],
    );
    await writeAudit(client, admin.id, 'settings.update', 'site_settings', null);
  });
  revalidatePath('/', 'layout');
  return { ok: true, message: '网站设置已保存。' };
}
