'use client';

import { useActionState } from 'react';
import { saveSettingsAction } from '@/lib/actions/settings';
import type { ActionState, SiteSettings } from '@/lib/types';

const initialState: ActionState = { ok: false, message: '' };

export function SettingsForm({ settings }: { settings: SiteSettings }) {
  const [state, action, pending] = useActionState(saveSettingsAction, initialState);
  return <form action={action} className="mt-7 grid gap-5 rounded-[24px] border border-[#d2d2d7] bg-white p-6 sm:p-8">
    {state.message && <div className={`rounded-xl px-4 py-3 text-sm ${state.ok ? 'bg-[#e1efe9] text-[#1c624f]' : 'bg-[#f7e5e1] text-[#983f34]'}`}>{state.message}</div>}
    <label className="grid gap-2 text-sm font-bold">网站名称<input name="site_name" defaultValue={settings.site_name} maxLength={80} required className="h-12 rounded-xl border border-[#d8dedb] px-4"/></label>
    <label className="grid gap-2 text-sm font-bold">品牌标语<input name="tagline" defaultValue={settings.tagline} maxLength={160} required className="h-12 rounded-xl border border-[#d8dedb] px-4"/></label>
    <div className="grid gap-5 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold">咨询电话<input name="consultation_phone" defaultValue={settings.consultation_phone ?? ''} maxLength={40} className="h-12 rounded-xl border border-[#d8dedb] px-4"/></label><label className="grid gap-2 text-sm font-bold">微信号<input name="consultation_wechat" defaultValue={settings.consultation_wechat ?? ''} maxLength={80} className="h-12 rounded-xl border border-[#d8dedb] px-4"/></label></div>
    <button disabled={pending} className="h-12 rounded-full bg-[#1d1d1f] font-semibold text-white disabled:opacity-60">{pending ? '保存中…' : '保存设置'}</button>
  </form>;
}
