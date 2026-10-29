import { AdminShell } from '@/components/admin/admin-shell';
import { AccountForm } from '@/components/admin/account-form';
import { requireAdmin } from '@/lib/data/admin';

export default async function AdminAccountPage() {
  const { user, profile } = await requireAdmin();
  return <AdminShell displayName={profile.display_name || user.email}>
    <div className="mx-auto max-w-2xl">
      <p className="eyebrow">Account security</p>
      <h1 className="display-font mt-2 text-4xl">账号安全</h1>
      <p className="mt-3 text-sm leading-6 text-[#6e6e73]">只有已登录的管理员可以在这里修改登录账号或密码。</p>
      <AccountForm loginName={profile.login_name}/>
    </div>
  </AdminShell>;
}
