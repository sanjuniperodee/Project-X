import Link from 'next/link';
import { OrderFilters } from '@/features/admin/orders/order-filters';
import { OrdersBoard } from '@/features/admin/orders/orders-board';
import { OrdersTable } from '@/features/admin/orders/orders-table';
import { ordersHref, parseOrdersSearch } from '@/features/admin/lib/orders-query';
import { BOARD_STATUSES } from '@/features/admin/lib/status';
import { PageHeader } from '@/features/admin/ui/page-header';
import { Pagination } from '@/features/admin/ui/pagination';
import { Panel } from '@/features/admin/ui/panel';
import { api } from '@/shared/api/server';
import { cn } from '@/shared/lib/cn';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { query, view, raw } = parseOrdersSearch(await searchParams);
  // The board shows every active order at once; the table pages through any selection.
  const page =
    view === 'board'
      ? await api.admin.projects({ ...query, status: query.status?.length ? query.status : BOARD_STATUSES, limit: 500, offset: 0 })
      : await api.admin.projects(query);

  const tab = (target: 'table' | 'board', label: string) => (
    <Link
      href={ordersHref({ ...raw, offset: undefined, view: target === 'board' ? 'board' : undefined })}
      aria-current={view === target ? 'page' : undefined}
      className={cn('flex h-8 items-center px-3 text-[13px]', view === target ? 'bg-ink text-white' : 'bg-surface hover:bg-bg')}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Заказы"
        description={`${page.total} ${raw.phone ? `заказов клиента ${raw.phone}` : 'по выбранным условиям'}`}
        actions={
          <div className="flex overflow-hidden rounded-control border border-line">
            {tab('table', 'Таблица')}
            {tab('board', 'Доска')}
          </div>
        }
      />
      <OrderFilters values={raw} view={view} />
      {view === 'board' ? (
        <OrdersBoard items={page.items} />
      ) : (
        <Panel flush>
          <OrdersTable items={page.items} empty="Заказов с такими условиями нет" />
          <Pagination offset={query.offset} limit={query.limit} total={page.total} href={(offset) => ordersHref({ ...raw, offset })} />
        </Panel>
      )}
    </div>
  );
}
