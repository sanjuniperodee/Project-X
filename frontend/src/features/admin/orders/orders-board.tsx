import Link from 'next/link';
import { formatTenge, type ProjectListItem } from '@px/contracts';
import { getBrand } from '@/brands';
import { cn } from '@/shared/lib/cn';
import { BOARD_STATUSES, STATUS_LABEL, STATUS_TONE, TONE_DOT } from '../lib/status';
import { Deadline } from '../ui/deadline';
import { Tag } from '../ui/status-badge';
import { designedByHand } from './orders-table';

/** Active orders as columns by status: the production pipeline at a glance. */
export function OrdersBoard({ items }: { items: ProjectListItem[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:-mx-8 lg:px-8">
      <div className="grid min-w-max auto-cols-[240px] grid-flow-col gap-3">
        {BOARD_STATUSES.map((status) => {
          const column = items.filter((o) => o.status === status);
          return (
            <section key={status} aria-label={STATUS_LABEL[status]} className="flex min-h-40 flex-col rounded-card border border-line bg-bg/60">
              <h2 className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-[13px] font-semibold">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className={cn('size-2 rounded-full', TONE_DOT[STATUS_TONE[status]])} />
                  {STATUS_LABEL[status]}
                </span>
                <span className="font-normal text-muted">{column.length}</span>
              </h2>
              <ul className="flex flex-col gap-2 p-2">
                {column.map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/orders/${o.id}`} className="block rounded-control border border-line bg-surface p-2.5 hover:border-zinc-400">
                      <span className="flex items-start justify-between gap-2">
                        <span className="font-medium">{o.subject}</span>
                        <span className="text-[12px] text-muted">{getBrand(o.productId).name}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted">{o.customerName}</span>
                      <span className="mt-2 flex items-center justify-between gap-2 text-[12px]">
                        <Deadline date={o.deadline} />
                        <span className="text-muted">{formatTenge(o.total)}</span>
                      </span>
                      {designedByHand(o) && (
                        <span className="mt-2 block">
                          <Tag tone="warning">вёрстка вручную</Tag>
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
