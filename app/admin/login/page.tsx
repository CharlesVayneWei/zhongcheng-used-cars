import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/admin/login-form';
import { Logo } from '@/components/ui/logo';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  const { changed } = await searchParams;
  const client = await createSupabaseServerClient();
  if (client) {
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      const { data: admin } = await client.from('admin_profiles').select('user_id').eq('user_id', user.id).maybeSingle();
      if (admin) redirect('/admin/cars');
    }
  }
  return <main className="grid min-h-screen place-items-center px-5 py-12">
    <div className="w-full max-w-md rounded-[28px] border border-[#d2d2d7] bg-white p-8 shadow-[0_30px_90px_rgba(0,0,0,.10)] sm:p-10">
      <Logo admin/>
      <div className="mt-10"><p className="eyebrow">Secure access</p><h1 className="display-font mt-2 text-4xl">管理员登录</h1><p className="mt-3 text-sm leading-6 text-[#6e6e73]">输入管理员账号和密码，进入管理后台。</p></div>
      {changed === '1' && <p role="status" className="mt-5 rounded-xl bg-[#e9f3e9] px-4 py-3 text-sm text-[#286140]">修改成功，请使用新账号和密码重新登录。</p>}
      <LoginForm/>
      <a href="/" className="mt-7 block text-center text-xs font-semibold text-[#6e6e73] hover:text-[#c6322b]">← 返回客户前台</a>
    </div>
  </main>;
}
