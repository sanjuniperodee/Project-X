import Link from 'next/link';
import { formatTenge, type CustomerSummary } from '@px/contracts';
import { cn } from '@/shared/lib/cn';
import { ago, formatPhone } from '../lib/format';
import { ProjectMark } from '../scope/project-mark';
import { project } from '../scope/projects';
import { Empty } from '../ui/panel';
import { rowLink, stretchedLink, Table, Td, Th } from '../ui/table';

/** Initials on a quiet tile: customers are told apart by name, not by colour. */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full bg-zinc-100 font-medium text-zinc-600" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials || '?'}
    </span>
  );
}

export function CustomersTable({ items }: { items: CustomerSummary[] }) {
  if (items.length === 0) return <Empty>Клиентов с такими условиями нет</Empty>;
  return (
    <Table minWidth={760}>
      <thead>
        <tr>
          <Th>Клиент</Th>
          <Th>Проекты</Th>
          <Th className="text-right">Заказы</Th>
          <Th className="text-right">Оплатил</Th>
          <Th className="text-right">Активность</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((c) => (
          <tr key={c.phone} className={rowLink}>
            <Td>
              <span className="flex items-center gap-3">
                <Avatar name={c.name} />
                <span className="min-w-0">
                  <Link href={`/admin/customers/${c.phone.replace(/\D/g, '')}`} className={cn('font-medium', stretchedLink)}>
                    {c.name}
                  </Link>
                  <span className="block text-[12px] text-muted">{formatPhone(c.phone)}</span>
                </span>
              </span>
            </Td>
            <Td>
              <span className="flex gap-1" title={c.productIds.map((id) => project(id).name).join(', ')}>
                {c.productIds.map((id) => (
                  <ProjectMark key={id} id={id} size={22} />
                ))}
                <span className="sr-only">{c.productIds.map((id) => project(id).name).join(', ')}</span>
              </span>
            </Td>
            <Td className="text-right">
              {c.orders}
              {c.activeOrders > 0 && <span className="block text-[12px] text-muted">в работе {c.activeOrders}</span>}
            </Td>
            <Td className="text-right">{formatTenge(c.revenue)}</Td>
            <Td className="text-right text-[13px] text-muted">{ago(c.lastActivityAt)} назад</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
