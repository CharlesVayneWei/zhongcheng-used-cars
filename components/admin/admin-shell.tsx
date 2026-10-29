import Link from 'next/link';
import { logoutAction } from '@/lib/actions/auth';
import { Logo } from '@/components/ui/logo';

export function AdminShell({ children, displayName }: { children: React.ReactNode; displayName?: string | null }) {
  return <>
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/94 backdrop-blur-xl">
      <div className="page-width flex min-h-20 flex-wrap items-center justify-between gap-3 py-3 sm:flex-nowrap sm:gap-4 sm:py-0">
        <Logo admin/>
        <nav className="flex w-full items-center justify-between gap-2 sm:w-auto sm:gap-6"><Link href="/admin/cars" className="text-sm font-semibold text-white">车辆管理</Link><Link href="/admin/settings" className="hidden text-sm font-medium text-white/55 sm:block">网站设置</Link><Link href="/admin/account" className="text-sm font-medium text-white/70">账号安全</Link><Link href="/" className="hidden text-sm font-medium text-white/55 sm:block">查看前台 ↗</Link><form action={logoutAction}><button className="rounded-full border border-white/20 px-3 py-2 text-xs font-semibold text-white/75">{displayName || '管理员'} · 退出</button></form></nav>
      </div>
    </header>
    <main className="page-width py-9 sm:py-12">{children}</main>
  </>;
}
