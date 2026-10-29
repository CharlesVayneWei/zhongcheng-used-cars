'use client';

import { useActionState } from 'react';
import { updateAdminCredentialsAction } from '@/lib/actions/auth';
import type { ActionState } from '@/lib/types';

const initialState: ActionState = { ok: false, message: '' };
const inputClass = 'h-12 rounded-xl border border-[#d2d2d7] bg-white px-4 outline-none focus:border-[#1d1d1f]';

export function AccountForm({ loginName }: { loginName: string }) {
  const [state, action, pending] = useActionState(updateAdminCredentialsAction, initialState);
  return <form action={action} className="mt-8 grid gap-5 rounded-[24px] border border-[#e2e2e5] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,.04)] sm:p-8">
    {state.message && <div role="alert" className="rounded-xl bg-[#f9e9e5] px-4 py-3 text-sm text-[#943f34]">{state.message}</div>}
    <label className="grid gap-2 text-sm font-semibold text-[#3a3a3c]">登录账号<input className={inputClass} type="text" name="login_name" autoComplete="username" defaultValue={loginName} required/></label>
    <div className="border-t border-[#ececef] pt-5"><p className="text-sm font-semibold">修改前验证</p><p className="mt-1 text-xs leading-5 text-[#6e6e73]">每次修改都需要输入当前密码。</p></div>
    <label className="grid gap-2 text-sm font-semibold text-[#3a3a3c]">当前密码<input className={inputClass} type="password" name="current_password" autoComplete="current-password" required/></label>
    <div className="border-t border-[#ececef] pt-5"><p className="text-sm font-semibold">设置新密码</p><p className="mt-1 text-xs leading-5 text-[#6e6e73]">只改账号可留空；修改密码时需输入两次，且至少 12 位。</p></div>
    <label className="grid gap-2 text-sm font-semibold text-[#3a3a3c]">新密码<input className={inputClass} type="password" name="new_password" autoComplete="new-password" minLength={12}/></label>
    <label className="grid gap-2 text-sm font-semibold text-[#3a3a3c]">再次输入新密码<input className={inputClass} type="password" name="confirm_password" autoComplete="new-password" minLength={12}/></label>
    <button disabled={pending} className="mt-2 h-12 rounded-full bg-[#1d1d1f] font-semibold text-white disabled:opacity-60">{pending ? '正在验证并保存…' : '验证并保存修改'}</button>
    <p className="text-xs leading-5 text-[#6e6e73]">保存后系统会再次验证修改后的密码，并要求使用新账号与密码重新登录。</p>
  </form>;
}
