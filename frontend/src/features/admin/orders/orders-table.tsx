import Link from 'next/link';
import { formatTenge, PROJECT_STATUSES_PAID, type ProjectListItem } from '@px/contracts';
import { getBrand } from '@/brands';
import { ago, formatPhone, whatsappLink } from '../lib/format';
import { Deadline } from '../ui/deadline';
import { Empty } from '../ui/panel';
import { StatusBadge, Tag } from '../ui/status-badge';
import { Table, Td, Th } from '../ui/table';

/** Orders as rows. `compact` hides secondary columns for dashboard panels. */
/** Design mode matters only while the layout is being made. */
export const designedByHand = (o: Pick<ProjectListItem, 'designMode' | 'status'>) =>
  o.designMode === 'studio' && (o.status === 'in_design' || o.status === 'awaiting_approval');

export function OrdersTable({
  items,
  empty,
  compact,
  hideCustomer,
}: {
  items: ProjectListItem[];
  empty: string;
  compact?: boolean;
  hideCustomer?: boolean;
}) {
  if (items.length === 0) return <Empty>{empty}</Empty>;
  return (
    <Table minWidth={compact || hideCustomer ? 620 : 980}>
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
          <tr key={o.id} className="hover:bg-bg/70">
            <Td>
              <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
                {o.subject}
              </Link>
              <span className="ml-2 text-[13px] text-muted">{getBrand(o.productId).name}</span>
              {!compact && designedByHand(o) && (
                <span className="ml-2">
                  <Tag tone="warning">вручную</Tag>
                </span>
              )}
              {!compact && o.contributionsCount > 0 && <span className="ml-2 text-[12px] text-muted">друзей: {o.contributionsCount}</span>}
            </Td>
            <Td>
              <StatusBadge status={o.status} />
            </Td>
            {!hideCustomer && (
              <Td>
                <span className="block max-w-[180px] truncate">{o.customerName}</span>
                <a href={whatsappLink(o.customerPhone)} target="_blank" rel="noreferrer" className="text-[12px] text-muted hover:text-ink">
                  {formatPhone(o.customerPhone)}
                </a>
              </Td>
            )}
            <Td>
              <Deadline date={o.deadline} done={PROJECT_STATUSES_PAID.includes(o.status) && o.status !== 'paid'} />
            </Td>
            <Td className="text-right whitespace-nowrap">
              {formatTenge(o.paidAmount)}
              <span className="block text-[12px] text-muted">из {formatTenge(o.total)}</span>
            </Td>
            {!compact && <Td className="text-right text-[13px] whitespace-nowrap text-muted">{ago(o.updatedAt)} назад</Td>}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
