import { RecoveryForm } from '@/components/admin/recovery-form';
import { Logo } from '@/components/ui/logo';

export default function ForgotPasswordPage() {
  return <main className="grid min-h-screen place-items-center px-5 py-12">
    <div className="w-full max-w-md rounded-[28px] border border-[#d2d2d7] bg-white p-8 shadow-[0_30px_90px_rgba(0,0,0,.10)] sm:p-10">
      <Logo admin/>
      <div className="mt-10"><p className="eyebrow">Password recovery</p><h1 className="display-font mt-2 text-4xl">忘记密码</h1><p className="mt-3 text-sm leading-6 text-[#6e6e73]">输入管理员账号和找回口令，通过验证后显示当前密码。</p></div>
      <RecoveryForm/>
      <a href="/admin/login" className="mt-7 block text-center text-xs font-semibold text-[#6e6e73] hover:text-[#c6322b]">← 返回管理员登录</a>
    </div>
  </main>;
}
