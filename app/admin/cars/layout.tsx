import { AdminShell } from '@/components/admin/admin-shell';
import { requireAdmin } from '@/lib/data/admin';

export default async function AdminCarsLayout({ children }: { children: React.ReactNode }) {
  const { profile, user } = await requireAdmin();
  return <AdminShell displayName={profile.display_name || user.email}>{children}</AdminShell>;
}
