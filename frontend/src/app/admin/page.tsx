import { PROJECT_STATUSES_ACTIVE } from '@px/contracts';
import { Dashboard } from '@/features/admin/dashboard/dashboard';
import { api } from '@/shared/api/server';

export default async function AdminDashboardPage() {
  const beforePrint = PROJECT_STATUSES_ACTIVE.filter((s) => s !== 'printing' && s !== 'shipped');
  const [stats, deadlines, latest] = await Promise.all([
    api.admin.stats(),
    api.admin.projects({ status: [...beforePrint], sort: 'deadline', limit: 8 }),
    api.admin.projects({ sort: 'created', limit: 8 }),
  ]);
  return <Dashboard stats={stats} deadlines={deadlines.items.filter((o) => o.deadline)} latest={latest.items} />;
}
