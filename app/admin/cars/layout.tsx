import { AdminShell } from '@/components/admin/admin-shell';
import { requireAdmin } from '@/lib/data/admin';

export default async function AdminCarsLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireAdmin();
  return <AdminShell displayName={admin.display_name || admin.login_name}>{children}</AdminShell>;
}
