'use client';

import { useActionState } from 'react';
import { saveCarAction } from '@/lib/actions/cars';
import type { ActionState, Car } from '@/lib/types';

const initialState: ActionState = { ok: false, message: '' };
const errorFor = (state: ActionState, field: string) => state.fieldErrors?.[field]?.[0];

function FieldError({ state, field }: { state: ActionState; field: string }) {
  const error = errorFor(state, field);
  return error ? <small className="text-[#a14236]">{error}</small> : null;
}

export function VehicleForm({ car }: { car?: Car | null }) {
  const [state, action, pending] = useActionState(saveCarAction, initialState);
  return <form action={action} className="grid gap-5">
    {car && <input type="hidden" name="id" value={car.id}/>} 
    {state.message && <div className={`rounded-xl px-4 py-3 text-sm ${state.ok ? 'bg-[#e1efe9] text-[#1c624f]' : 'bg-[#f7e5e1] text-[#983f34]'}`}>{state.message}</div>}
    <section className="rounded-[24px] border border-[#d2d2d7] bg-white p-5 sm:p-7"><div className="mb-6"><p className="eyebrow">Basic information</p><h2 className="mt-1 text-xl font-semibold">基本信息</h2></div><div className="grid gap-5 sm:grid-cols-2">
      <label className="sm:col-span-2 grid gap-2 text-sm font-bold">车辆展示名称<input name="title" defaultValue={car?.title ?? ''} maxLength={160} placeholder="例如：宝马 5系 2022款 530Li 尊享型" className="h-12 rounded-xl border border-[#d8dedb] px-4"/><FieldError state={state} field="title"/></label>
      <label className="grid gap-2 text-sm font-bold">品牌<input name="brand" defaultValue={car?.brand ?? ''} maxLength={80} placeholder="宝马" className="h-12 rounded-xl border border-[#d8dedb] px-4"/><FieldError state={state} field="brand"/></label>
      <label className="grid gap-2 text-sm font-bold">具体型号<input name="model" defaultValue={car?.model ?? ''} maxLength={120} placeholder="530Li 尊享型" className="h-12 rounded-xl border border-[#d8dedb] px-4"/><FieldError state={state} field="model"/></label>
      <label className="grid gap-2 text-sm font-bold">上牌年份<input type="number" name="registration_year" defaultValue={car?.registration_year ?? ''} min="1980" max={new Date().getFullYear() + 1} className="h-12 rounded-xl border border-[#d8dedb] px-4"/><FieldError state={state} field="registration_year"/></label>
      <div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-sm font-bold">省份<input name="registration_province" defaultValue={car?.registration_province ?? ''} maxLength={40} className="h-12 rounded-xl border border-[#d8dedb] px-4"/></label><label className="grid gap-2 text-sm font-bold">城市<input name="registration_city" defaultValue={car?.registration_city ?? ''} maxLength={40} className="h-12 rounded-xl border border-[#d8dedb] px-4"/></label></div>
      <label className="grid gap-2 text-sm font-bold">实际里程（公里）<input type="number" name="mileage_km" defaultValue={car?.mileage_km ?? ''} min="0" className="h-12 rounded-xl border border-[#d8dedb] px-4"/><FieldError state={state} field="mileage_km"/></label>
      <label className="grid gap-2 text-sm font-bold">保险状态<select name="insurance_status" defaultValue={car?.insurance_status ?? 'unknown'} className="h-12 rounded-xl border border-[#d8dedb] bg-white px-4"><option value="unknown">未知</option><option value="insured">有保险</option><option value="uninsured">无保险</option></select></label>
      <label className="grid gap-2 text-sm font-bold">保险到期日<input type="date" name="insurance_expiry" defaultValue={car?.insurance_expiry ?? ''} className="h-12 rounded-xl border border-[#d8dedb] px-4"/><FieldError state={state} field="insurance_expiry"/></label>
    </div></section>
    <section className="rounded-[24px] border border-[#d2d2d7] bg-white p-5 sm:p-7"><div className="mb-6"><p className="eyebrow">Pricing</p><h2 className="mt-1 text-xl font-semibold">价格信息</h2></div><div className="grid gap-5 sm:grid-cols-3">
      <label className="grid gap-2 text-sm font-bold">全款价格（元）<input type="number" name="cash_price_yuan" defaultValue={car?.cash_price_yuan ?? ''} min="0" className="h-12 rounded-xl border border-[#d8dedb] px-4"/><FieldError state={state} field="cash_price_yuan"/></label>
      <label className="grid gap-2 text-sm font-bold">分期标价（元）<input type="number" name="installment_price_yuan" defaultValue={car?.installment_price_yuan ?? ''} min="0" className="h-12 rounded-xl border border-[#d8dedb] px-4"/><FieldError state={state} field="installment_price_yuan"/></label>
      <label className="grid gap-2 text-sm font-bold">分期首付（元）<input type="number" name="down_payment_yuan" defaultValue={car?.down_payment_yuan ?? ''} min="0" className="h-12 rounded-xl border border-[#d8dedb] px-4"/><FieldError state={state} field="down_payment_yuan"/></label>
    </div></section>
    <section className="rounded-[24px] border border-[#d2d2d7] bg-white p-5 sm:p-7"><div className="mb-6"><p className="eyebrow">Condition</p><h2 className="mt-1 text-xl font-semibold">车身状况原文</h2><p className="mt-2 text-xs text-[#6e6e73]">前台将保持此处原文与换行，仅作为纯文本显示，不执行 HTML。</p></div><textarea name="condition_description" defaultValue={car?.condition_description ?? ''} maxLength={10000} rows={8} className="w-full rounded-xl border border-[#d2d2d7] p-4 leading-7"/><FieldError state={state} field="condition_description"/></section>
    <div className="sticky bottom-4 z-20 flex flex-wrap gap-2 rounded-[24px] border border-[#d2d2d7] bg-white/92 p-3 shadow-[0_18px_60px_rgba(0,0,0,.12)] backdrop-blur"><button disabled={pending} name="status" value="draft" className="rounded-full border border-[#d2d2d7] px-5 py-3 text-sm font-semibold">保存草稿</button>{car && <><button disabled={pending} name="status" value="published" className="rounded-full bg-[#1d1d1f] px-5 py-3 text-sm font-semibold text-white">保存并上架</button><button disabled={pending} name="status" value="sold" className="rounded-full bg-[#c6322b] px-5 py-3 text-sm font-semibold text-white">标记已售</button><button disabled={pending} name="status" value="archived" className="rounded-full border border-[#d2d2d7] px-5 py-3 text-sm font-semibold">下架</button></>}</div>
  </form>;
}
