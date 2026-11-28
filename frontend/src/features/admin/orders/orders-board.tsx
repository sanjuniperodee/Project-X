import Link from 'next/link';
import { formatTenge, type ProjectListItem } from '@px/contracts';
import { cn } from '@/shared/lib/cn';
import { BOARD_STATUSES, STATUS_LABEL, STATUS_TONE, TONE_DOT } from '../lib/status';
import { ProjectLabel } from '../scope/project-mark';
import { project } from '../scope/projects';
import { Deadline } from '../ui/deadline';
import { Tag } from '../ui/status-badge';
import { designedByHand } from './orders-table';

/** Active orders as columns by status: the production pipeline at a glance. */
export function OrdersBoard({ items, showProject }: { items: ProjectListItem[]; showProject: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 lg:-mx-9 lg:px-9">
      <div className="grid min-w-max auto-cols-[264px] grid-flow-col gap-3">
        {BOARD_STATUSES.map((status) => {
          const column = items.filter((o) => o.status === status);
          const sum = column.reduce((total, o) => total + o.total, 0);
          return (
            <section key={status} aria-label={STATUS_LABEL[status]} className="flex min-h-48 flex-col rounded-card bg-zinc-200/50 p-1.5">
              <h2 className="flex items-center justify-between gap-2 px-2 pt-1.5 pb-2.5 text-[13px] font-semibold">
                <span className="flex items-center gap-2">
                  <span aria-hidden className={cn('size-2 rounded-full', TONE_DOT[STATUS_TONE[status]])} />
                  {STATUS_LABEL[status]}
                  <span className="rounded-full bg-white px-1.5 text-[12px] font-medium text-zinc-600">{column.length}</span>
                </span>
                {sum > 0 && <span className="text-[12px] font-normal text-muted">{formatTenge(sum)}</span>}
              </h2>
              <ul className="flex flex-col gap-1.5">
                {column.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="relative block overflow-hidden rounded-[10px] border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(24,24,27,0.05)] transition-[border-color,box-shadow] hover:border-zinc-300 hover:shadow-[0_4px_14px_-6px_rgba(24,24,27,0.2)]"
                    >
                      {showProject && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: project(o.productId).color }} />}
                      <span className="block font-medium">{o.subject}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted">{o.customerName}</span>
                      <span className="mt-2.5 flex items-center justify-between gap-2 text-[12px]">
                        <Deadline date={o.deadline} />
                        <span className="text-muted">{formatTenge(o.total)}</span>
                      </span>
                      {(showProject || designedByHand(o)) && (
                        <span className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2 text-[12px] text-zinc-600">
                          {showProject ? <ProjectLabel id={o.productId} /> : <span />}
                          {designedByHand(o) && <Tag tone="warning">вручную</Tag>}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
                {column.length === 0 && <li className="px-2 py-6 text-center text-[12px] text-muted">Пусто</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
