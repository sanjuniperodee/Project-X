import Link from 'next/link';
import { formatTenge, PROJECT_STATUSES_PAID, type ProjectListItem } from '@px/contracts';
import { cn } from '@/shared/lib/cn';
import { ago, formatPhone } from '../lib/format';
import { ProjectLabel } from '../scope/project-mark';
import { project } from '../scope/projects';
import { Deadline } from '../ui/deadline';
import { Empty } from '../ui/panel';
import { StatusBadge, Tag } from '../ui/status-badge';
import { rowLink, stretchedLink, Table, Td, Th } from '../ui/table';

/** Design mode matters only while the layout is being made. */
export const designedByHand = (o: Pick<ProjectListItem, 'designMode' | 'status'>) =>
  o.designMode === 'studio' && (o.status === 'in_design' || o.status === 'awaiting_approval');

/**
 * Orders as rows; the whole row opens the order. `compact` hides secondary columns for dashboard
 * panels, `showProject` marks each order with its project (the overview of all projects).
 */
export function OrdersTable({
  items,
  empty,
  compact,
  hideCustomer,
  showProject = true,
}: {
  items: ProjectListItem[];
  empty: string;
  compact?: boolean;
  hideCustomer?: boolean;
  showProject?: boolean;
}) {
  if (items.length === 0) return <Empty>{empty}</Empty>;
  return (
    <Table minWidth={compact || hideCustomer ? 640 : 1000}>
      <thead>
        <tr>
          <Th>Заказ</Th>
          <Th>Статус</Th>
          {!hideCustomer && <Th>Клиент</Th>}
          <Th>Праздник</Th>
          <Th className="text-right">Оплачено</Th>
          {!compact && <Th className="text-right">Обновлён</Th>}
        </tr>
      </thead>
      <tbody>
        {items.map((o) => (
          <tr key={o.id} className={rowLink}>
            <Td className="relative">
              {showProject && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full" style={{ background: project(o.productId).color }} />}
              <Link href={`/admin/orders/${o.id}`} className={cn('font-medium', stretchedLink)}>
                {o.subject}
              </Link>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                {showProject && <ProjectLabel id={o.productId} />}
                {!compact && designedByHand(o) && <Tag tone="warning">вёрстка вручную</Tag>}
                {!compact && o.contributionsCount > 0 && <span>друзей {o.contributionsCount}</span>}
              </span>
            </Td>
            <Td>
              <StatusBadge status={o.status} />
            </Td>
            {!hideCustomer && (
              <Td>
                <span className="block max-w-[200px] truncate">{o.customerName}</span>
                <span className="block text-[12px] text-muted">{formatPhone(o.customerPhone)}</span>
              </Td>
            )}
            <Td>
              <Deadline date={o.deadline} done={PROJECT_STATUSES_PAID.includes(o.status) && o.status !== 'paid'} />
            </Td>
            <Td className="text-right whitespace-nowrap">
              <Paid paid={o.paidAmount} total={o.total} />
            </Td>
            {!compact && <Td className="text-right text-[13px] whitespace-nowrap text-muted">{ago(o.updatedAt)} назад</Td>}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/** Paid of total, with a thin bar: empty, deposit, or full. */
export function Paid({ paid, total }: { paid: number; total: number }) {
  const share = total > 0 ? Math.min(1, paid / total) : 0;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span>
        {formatTenge(paid)}
        <span className="text-[12px] text-muted"> из {formatTenge(total)}</span>
      </span>
      <span aria-hidden className="block h-1 w-24 overflow-hidden rounded-full bg-zinc-100">
        <span className={cn('block h-full rounded-full', share >= 1 ? 'bg-emerald-500' : 'bg-zinc-800')} style={{ width: `${share * 100}%` }} />
      </span>
    </span>
  );
}
