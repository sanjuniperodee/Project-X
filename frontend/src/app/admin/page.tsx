import { PROJECT_STATUSES_ACTIVE } from '@px/contracts';
import { Dashboard } from '@/features/admin/dashboard/dashboard';
import { PROJECTS } from '@/features/admin/scope/projects';
import { getScope } from '@/features/admin/scope/scope';
import { api } from '@/shared/api/server';

export default async function AdminDashboardPage() {
  const scope = await getScope();
  const productId = scope ?? undefined;
  const beforePrint = PROJECT_STATUSES_ACTIVE.filter((s) => s !== 'printing' && s !== 'shipped');
  const [stats, perProject, deadlines, latest] = await Promise.all([
    api.admin.stats(productId),
    // The overview of all projects compares them side by side.
    scope ? Promise.resolve([]) : Promise.all(PROJECTS.map(async (p) => ({ id: p.id, stats: await api.admin.stats(p.id) }))),
    api.admin.projects({ status: [...beforePrint], productId, sort: 'deadline', limit: 6 }),
    api.admin.projects({ productId, sort: 'created', limit: 6 }),
  ]);
  return <Dashboard scope={scope} stats={stats} perProject={perProject} deadlines={deadlines.items.filter((o) => o.deadline)} latest={latest.items} />;
}
