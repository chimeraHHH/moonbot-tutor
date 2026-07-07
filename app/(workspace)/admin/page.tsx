import { AdminDashboard } from '@/components/admin/admin-dashboard';
import { requireRole } from '@/lib/server/auth';

export default async function AdminPage() {
  const user = await requireRole(['admin']);
  return <AdminDashboard currentUserId={user.id} />;
}
