import { AdminShell } from '@/components/admin/admin-shell';
import { SettingsForm } from '@/components/admin/settings-form';
import { requireAdmin } from '@/lib/data/admin';
import { getSiteSettings } from '@/lib/data/settings';

export default async function SettingsPage() {
  const [{ profile, user }, settings] = await Promise.all([requireAdmin(), getSiteSettings()]);
  return <AdminShell displayName={profile.display_name || user.email}><div className="mx-auto max-w-2xl"><p className="eyebrow">Site settings</p><h1 className="display-font mt-2 text-4xl">网站设置</h1><p className="mt-2 text-sm text-[#6e6e73]">配置前台品牌名称和咨询联系方式。</p><SettingsForm settings={settings}/></div></AdminShell>;
}
