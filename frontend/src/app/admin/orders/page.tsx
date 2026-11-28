import Link from 'next/link';
import { OrderFilters } from '@/features/admin/orders/order-filters';
import { OrdersBoard } from '@/features/admin/orders/orders-board';
import { OrdersTable } from '@/features/admin/orders/orders-table';
import { StatusTabs } from '@/features/admin/orders/status-tabs';
import { ordersHref, parseOrdersSearch } from '@/features/admin/lib/orders-query';
import { BOARD_STATUSES } from '@/features/admin/lib/status';
import { ProjectMark } from '@/features/admin/scope/project-mark';
import { getScope } from '@/features/admin/scope/scope';
import { Icons } from '@/features/admin/ui/icons';
import { PageHeader } from '@/features/admin/ui/page-header';
import { Pagination } from '@/features/admin/ui/pagination';
import { Panel } from '@/features/admin/ui/panel';
import { api } from '@/shared/api/server';
import { cn } from '@/shared/lib/cn';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = await getScope();
  const { query, view, raw } = parseOrdersSearch(await searchParams);
  // The project chosen in the sidebar wins over the filter in the address.
  if (scope) {
    query.productId = scope;
    delete raw.productId;
  }
  const productId = query.productId;
  const [page, stats] = await Promise.all([
    // The board shows every active order at once; the table pages through any selection.
    view === 'board'
      ? api.admin.projects({ ...query, status: query.status?.length ? query.status : BOARD_STATUSES, limit: 500, offset: 0 })
      : api.admin.projects(query),
    api.admin.stats(productId),
  ]);

  const tab = (target: 'table' | 'board', label: string, Icon: (typeof Icons)['table']) => (
    <Link
      href={ordersHref({ ...raw, offset: undefined, view: target === 'board' ? 'board' : undefined })}
      aria-current={view === target ? 'page' : undefined}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] transition-colors',
        view === target ? 'bg-white font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-muted hover:text-ink',
      )}
    >
      <Icon width={15} height={15} />
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        mark={scope ? <ProjectMark id={scope} size={28} /> : undefined}
        title="Заказы"
        description={raw.phone ? `Все заказы клиента ${raw.phone}` : `${page.total} по выбранным условиям`}
        actions={
          <div className="flex rounded-[8px] bg-zinc-200/70 p-0.5">
            {tab('table', 'Таблица', Icons.table)}
            {tab('board', 'Доска', Icons.board)}
          </div>
        }
      />
      {view === 'table' && <StatusTabs byStatus={stats.byStatus} values={raw} />}
      <OrderFilters values={raw} view={view} showProduct={!scope} />
      {view === 'board' ? (
        <OrdersBoard items={page.items} showProject={!productId} />
      ) : (
        <Panel flush>
          <OrdersTable items={page.items} empty="Заказов с такими условиями нет" showProject={!productId} />
          <Pagination offset={query.offset} limit={query.limit} total={page.total} href={(offset) => ordersHref({ ...raw, offset })} />
        </Panel>
      )}
    </div>
  );
}
