'use client';

import { useActionState } from 'react';
import { loginAction } from '@/lib/actions/auth';
import type { ActionState } from '@/lib/types';

const initialState: ActionState = { ok: false, message: '' };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  return <form action={action} className="mt-8 grid gap-4">
    {state.message && <div className="rounded-xl bg-[#f9e9e5] px-4 py-3 text-sm text-[#943f34]">{state.message}</div>}
    <label className="grid gap-2 text-sm font-semibold text-[#3a3a3c]">管理员账号<input type="text" name="login_name" autoComplete="username" defaultValue="weiling" required className="h-12 rounded-xl border border-[#d2d2d7] bg-white px-4 outline-none focus:border-[#1d1d1f]"/></label>
    <label className="grid gap-2 text-sm font-semibold text-[#3a3a3c]">密码<input type="password" name="password" autoComplete="current-password" required className="h-12 rounded-xl border border-[#d2d2d7] bg-white px-4 outline-none focus:border-[#1d1d1f]"/></label>
    <button disabled={pending} className="mt-2 h-12 rounded-full bg-[#1d1d1f] font-semibold text-white disabled:opacity-60">{pending ? '正在验证…' : '登录后台'}</button>
    <a href="/admin/forgot-password" className="text-right text-xs font-semibold text-[#6e6e73] hover:text-[#c6322b]">忘记密码？</a>
  </form>;
}
