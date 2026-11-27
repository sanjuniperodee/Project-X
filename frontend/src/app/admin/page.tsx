import { ProjectStatus } from '@px/contracts';
import { ProjectsTable } from '@/features/admin/projects-table';
import { api } from '@/shared/api/server';

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const status = ProjectStatus.safeParse((await searchParams).status);
  const items = await api.admin.projects(status.success ? status.data : undefined);
  return <ProjectsTable items={items} status={status.success ? status.data : null} />;
}
