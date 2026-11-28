import { CustomersTable } from '@/features/admin/customers/customers-table';
import { ProjectMark } from '@/features/admin/scope/project-mark';
import { project } from '@/features/admin/scope/projects';
import { getScope } from '@/features/admin/scope/scope';
import { Icons } from '@/features/admin/ui/icons';
import { PageHeader } from '@/features/admin/ui/page-header';
import { Pagination } from '@/features/admin/ui/pagination';
import { Panel } from '@/features/admin/ui/panel';
import { api } from '@/shared/api/server';

const LIMIT = 50;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; offset?: string }> }) {
  const [params, scope] = await Promise.all([searchParams, getScope()]);
  const q = params.q?.trim() || undefined;
  const offset = Math.max(0, Number(params.offset) || 0);
  const page = await api.admin.customers({ q, productId: scope ?? undefined, limit: LIMIT, offset });
  const href = (next: number) => `/admin/customers?${new URLSearchParams({ ...(q ? { q } : {}), ...(next ? { offset: String(next) } : {}) })}`;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        mark={scope ? <ProjectMark id={scope} size={28} /> : undefined}
        title="Клиенты"
        description={`${page.total} ${scope ? `заказывали ${project(scope).name}` : 'по номеру телефона, со всеми заказами'}`}
      />
      <form action="/admin/customers" className="flex gap-2">
        <label className="relative">
          <span className="sr-only">Поиск клиента</span>
          <Icons.search className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" width={16} height={16} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Имя или телефон"
            className="h-9 w-72 max-w-full rounded-control border border-line bg-surface pr-2.5 pl-8 text-[13px] placeholder:text-muted hover:border-zinc-300 focus-visible:border-zinc-400 focus-visible:outline-none"
          />
        </label>
        <button type="submit" className="h-9 rounded-control border border-line bg-surface px-3.5 text-[13px] font-medium hover:border-zinc-300">
          Найти
        </button>
      </form>
      <Panel flush>
        <CustomersTable items={page.items} />
        <Pagination offset={offset} limit={LIMIT} total={page.total} href={href} />
      </Panel>
    </div>
  );
}
