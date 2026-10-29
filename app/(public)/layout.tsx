import Link from 'next/link';
import { ContactDialogProvider, ContactDialogTrigger } from '@/components/contact/contact-dialog';
import { Logo } from '@/components/ui/logo';
import { getSiteSettings } from '@/lib/data/settings';
import { isDemoMode } from '@/lib/config';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  return <ContactDialogProvider siteName={settings.site_name} phone={settings.consultation_phone} wechat={settings.consultation_wechat}>
  <div className="min-h-screen">
    {isDemoMode && <div className="border-b border-white/10 bg-[#050505] px-4 py-2 text-center text-[10px] font-medium tracking-[.06em] text-white/55">演示模式 · 当前车辆为界面示例，配置 Supabase 后请关闭 NEXT_PUBLIC_DEMO_MODE</div>}
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/94 backdrop-blur-xl">
      <div className="page-width flex min-h-20 items-center justify-between gap-4">
        <Logo name={settings.site_name}/>
        <nav className="flex items-center gap-4 text-[13px] font-medium text-white/65 sm:gap-7">
          <Link className="py-3 transition hover:text-white" href="/">首页</Link>
          <Link className="py-3 transition hover:text-white" href="/cars">全部车源</Link>
          <ContactDialogTrigger className="hidden cursor-pointer rounded-full bg-white px-5 py-2.5 text-black transition hover:bg-white/85 sm:block" />
        </nav>
      </div>
    </header>
    <main>{children}</main>
    <footer id="contact" className="mt-28 bg-[#0a0a0a] text-white">
      <div className="page-width grid gap-10 py-14 md:grid-cols-[1.5fr_1fr_1fr]">
        <div><Logo name={settings.site_name} dark/><p className="mt-5 max-w-md text-sm leading-7 text-white/45">{settings.tagline}。所有车辆信息由管理员维护，价格与车况以现场确认为准。</p></div>
        <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-white/35">Explore</p><div className="mt-4 grid gap-3 text-sm text-white/65"><Link href="/cars">全部车源</Link><Link href="/cars?sort=latest">最新发布</Link><Link href="/admin/login">管理员入口</Link></div></div>
        <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-white/35">Contact</p><div className="mt-4 grid gap-3 text-sm text-white/65"><span>电话：{settings.consultation_phone || '待配置'}</span><span>微信：{settings.consultation_wechat || '待配置'}</span></div></div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-[11px] text-white/45">© {new Date().getFullYear()} {settings.site_name} · 车辆展示平台</div>
    </footer>
  </div>
  </ContactDialogProvider>;
}
