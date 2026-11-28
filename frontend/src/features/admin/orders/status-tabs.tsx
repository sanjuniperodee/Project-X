import Link from 'next/link';
import { PROJECT_STATUSES_ACTIVE, type AdminStats } from '@px/contracts';
import { cn } from '@/shared/lib/cn';
import { ordersHref } from '../lib/orders-query';
import { BOARD_STATUSES, STATUS_LABEL, STATUS_TONE, TONE_DOT } from '../lib/status';

const IN_WORK = PROJECT_STATUSES_ACTIVE.join(',');

/** Statuses as tabs with their counts: the list a click away from any stage of the work. */
export function StatusTabs({ byStatus, values }: { byStatus: AdminStats['byStatus']; values: Record<string, string> }) {
  const all = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const inWork = PROJECT_STATUSES_ACTIVE.reduce((sum, s) => sum + byStatus[s], 0);
  const tabs = [
    { value: '', label: 'Все', count: all, dot: null },
    { value: IN_WORK, label: 'В работе', count: inWork, dot: null },
    ...[...BOARD_STATUSES, 'delivered' as const, 'cancelled' as const].map((s) => ({ value: s, label: STATUS_LABEL[s], count: byStatus[s], dot: TONE_DOT[STATUS_TONE[s]] })),
  ];
  const current = values.status ?? '';
  return (
    <nav aria-label="Статусы" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((tab) => {
          const active = tab.value === current;
          return (
            <li key={tab.label}>
              <Link
                href={ordersHref({ ...values, status: tab.value || undefined, offset: undefined })}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px flex h-10 items-center gap-2 border-b-2 px-2.5 text-[13px] whitespace-nowrap transition-colors',
                  active ? 'border-ink font-medium text-ink' : 'border-transparent text-zinc-500 hover:text-ink',
                )}
              >
                {tab.dot && <span aria-hidden className={cn('size-1.5 rounded-full', tab.dot)} />}
                {tab.label}
                <span className={cn('rounded-full px-1.5 text-[12px] tabular-nums', active ? 'bg-ink text-white' : 'bg-zinc-200/70 text-zinc-600')}>{tab.count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
