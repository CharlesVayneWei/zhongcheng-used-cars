'use client';

import { useActionState } from 'react';
import { recoverAdminPasswordAction, type RecoveryState } from '@/lib/actions/auth';

const initialState: RecoveryState = { ok: false, message: '' };
const inputClass = 'h-12 rounded-xl border border-[#d2d2d7] bg-white px-4 outline-none focus:border-[#1d1d1f]';

export function RecoveryForm() {
  const [state, action, pending] = useActionState(recoverAdminPasswordAction, initialState);
  return <form action={action} className="mt-8 grid gap-4">
    {state.message && <div role="status" className={`rounded-xl px-4 py-3 text-sm ${state.ok ? 'bg-[#e9f3e9] text-[#286140]' : 'bg-[#f9e9e5] text-[#943f34]'}`}>{state.message}</div>}
    <label className="grid gap-2 text-sm font-semibold text-[#3a3a3c]">管理员账号<input className={inputClass} type="text" name="login_name" autoComplete="username" defaultValue="weiling" required/></label>
    <label className="grid gap-2 text-sm font-semibold text-[#3a3a3c]">找回口令<input className={inputClass} type="password" name="recovery_code" autoComplete="off" required/></label>
    <button disabled={pending} className="mt-2 h-12 rounded-full bg-[#1d1d1f] font-semibold text-white disabled:opacity-60">{pending ? '正在验证…' : '显示密码'}</button>
    {state.ok && state.password && <div className="rounded-xl border border-[#d5e7d8] bg-[#f2f8f3] p-4"><p className="text-xs font-semibold text-[#286140]">当前密码</p><output className="mt-2 block break-all font-mono text-lg text-[#1d1d1f]">{state.password}</output></div>}
  </form>;
}
