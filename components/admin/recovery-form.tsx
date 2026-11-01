'use client';

import { useActionState } from 'react';
import { resetAdminPasswordAction } from '@/lib/actions/auth';
import type { ActionState } from '@/lib/types';

const initialState: ActionState = { ok: false, message: '' };
const inputClass = 'h-12 rounded-xl border border-[#d2d2d7] bg-white px-4 outline-none focus:border-[#1d1d1f]';

export function RecoveryForm() {
  const [state, action, pending] = useActionState(resetAdminPasswordAction, initialState);
  return <form action={action} className="mt-8 grid gap-4">
    {state.message && <div role="status" className={`rounded-xl px-4 py-3 text-sm ${state.ok ? 'bg-[#e9f3e9] text-[#286140]' : 'bg-[#f9e9e5] text-[#943f34]'}`}>{state.message}</div>}
    <label className="grid gap-2 text-sm font-semibold text-[#3a3a3c]">管理员账号<input className={inputClass} type="text" name="login_name" autoComplete="username" defaultValue="weiling" required/></label>
    <label className="grid gap-2 text-sm font-semibold text-[#3a3a3c]">一次性重置令牌<input className={inputClass} type="password" name="reset_token" autoComplete="off" required/></label>
    <label className="grid gap-2 text-sm font-semibold text-[#3a3a3c]">新密码<input className={inputClass} type="password" name="new_password" autoComplete="new-password" minLength={12} required/></label>
    <label className="grid gap-2 text-sm font-semibold text-[#3a3a3c]">再次输入新密码<input className={inputClass} type="password" name="confirm_password" autoComplete="new-password" minLength={12} required/></label>
    <button disabled={pending} className="mt-2 h-12 rounded-full bg-[#1d1d1f] font-semibold text-white disabled:opacity-60">{pending ? '正在验证并重置…' : '设置新密码'}</button>
  </form>;
}
