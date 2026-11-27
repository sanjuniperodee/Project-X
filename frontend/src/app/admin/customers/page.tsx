import { CustomersTable } from '@/features/admin/customers/customers-table';
import { PageHeader } from '@/features/admin/ui/page-header';
import { Pagination } from '@/features/admin/ui/pagination';
import { Panel } from '@/features/admin/ui/panel';
import { api } from '@/shared/api/server';

const LIMIT = 50;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; offset?: string }> }) {
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const offset = Math.max(0, Number(params.offset) || 0);
  const page = await api.admin.customers({ q, limit: LIMIT, offset });
  const href = (next: number) => `/admin/customers?${new URLSearchParams({ ...(q ? { q } : {}), ...(next ? { offset: String(next) } : {}) })}`;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Клиенты" description={`${page.total} — по номеру телефона, со всеми заказами`} />
      <form action="/admin/customers" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Имя или телефон"
          aria-label="Поиск клиента"
          className="h-8 w-64 rounded-control border border-line bg-surface px-2.5 text-[13px] placeholder:text-muted"
        />
        <button type="submit" className="h-8 rounded-control border border-line bg-surface px-3 text-[13px] hover:bg-bg">
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
