import Link from 'next/link';
import { formatTenge, type CustomerSummary } from '@px/contracts';
import { getBrand } from '@/brands';
import { ago, formatPhone } from '../lib/format';
import { Empty } from '../ui/panel';
import { Table, Td, Th } from '../ui/table';

export function CustomersTable({ items }: { items: CustomerSummary[] }) {
  if (items.length === 0) return <Empty>Клиентов с такими условиями нет</Empty>;
  return (
    <Table minWidth={760}>
      <thead>
        <tr>
          <Th>Клиент</Th>
          <Th>Продукты</Th>
          <Th className="text-right">Заказы</Th>
          <Th className="text-right">Оплатил</Th>
          <Th className="text-right">Активность</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((c) => (
          <tr key={c.phone} className="hover:bg-bg/70">
            <Td>
              <Link href={`/admin/customers/${c.phone.replace(/\D/g, '')}`} className="font-medium hover:underline">
                {c.name}
              </Link>
              <span className="block text-[12px] text-muted">{formatPhone(c.phone)}</span>
            </Td>
            <Td className="text-[13px]">{c.productIds.map((id) => getBrand(id).name).join(', ')}</Td>
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
