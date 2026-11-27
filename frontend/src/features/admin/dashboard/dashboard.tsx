import Link from 'next/link';
import { formatTenge, PROJECT_STATUSES_ACTIVE, type AdminStats, type ProjectListItem } from '@px/contracts';
import { getBrand } from '@/brands';
import { cn } from '@/shared/lib/cn';
import { percent } from '../lib/format';
import { ordersHref } from '../lib/orders-query';
import { OrdersTable } from '../orders/orders-table';
import { PageHeader } from '../ui/page-header';
import { Panel } from '../ui/panel';
import { Table, Td, Th } from '../ui/table';

const BEFORE_PRINT = PROJECT_STATUSES_ACTIVE.filter((s) => s !== 'printing' && s !== 'shipped').join(',');

/** What the studio has to do now, in the order the work happens. Each queue opens the filtered order list. */
function queues(stats: AdminStats) {
  const a = stats.attention;
  return [
    { label: 'Без предоплаты больше 2 дней', hint: 'Написать или позвонить', count: a.unpaid, href: ordersHref({ status: 'draft', sort: 'created' }) },
    { label: 'Вёрстка вручную', hint: 'Автовёрстка остановилась', count: a.handoff, href: ordersHref({ status: 'in_design', design: 'studio' }) },
    { label: 'Ждут согласования клиента', hint: 'Напомнить про макет', count: a.awaitingApproval, href: ordersHref({ status: 'awaiting_approval' }) },
    { label: 'Оплачены — в печать', hint: 'Отправить в типографию', count: a.toPrint, href: ordersHref({ status: 'paid' }) },
    { label: 'Напечатаны — в доставку', hint: 'Передать курьеру', count: a.toShip, href: ordersHref({ status: 'printing' }) },
    { label: 'Праздник в ближайшие 14 дней', hint: 'Не напечатаны', count: a.deadlineSoon, href: ordersHref({ status: BEFORE_PRINT, sort: 'deadline' }) },
  ];
}

export function Dashboard({ stats, deadlines, latest }: { stats: AdminStats; deadlines: ProjectListItem[]; latest: ProjectListItem[] }) {
  const revenueDelta = stats.month.revenue - stats.previousMonth.revenue;
  const f = stats.funnel;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Сводка" description="Что требует действия сегодня и как идут продажи" />

      <Panel title="Требует действия" flush>
        <ul className="grid sm:grid-cols-2 xl:grid-cols-3">
          {queues(stats).map((q) => (
            <li key={q.label} className="border-b border-line sm:odd:border-r xl:border-r xl:[&:nth-child(3n)]:border-r-0">
              <Link href={q.href} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-bg">
                <span className="min-w-0">
                  <span className="block font-medium">{q.label}</span>
                  <span className="block text-[13px] text-muted">{q.hint}</span>
                </span>
                <span className={cn('text-[22px] font-semibold', q.count === 0 && 'text-zinc-300')}>{q.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Оплачено за месяц"
          value={formatTenge(stats.month.revenue)}
          note={`${revenueDelta >= 0 ? '+' : '−'}${formatTenge(Math.abs(revenueDelta))} к прошлому месяцу`}
        />
        <Metric label="Новых заказов за месяц" value={String(stats.month.orders)} note={`в прошлом месяце ${stats.previousMonth.orders}`} />
        <Metric label="Средний чек" value={formatTenge(stats.averageCheck)} note="по заказам с предоплатой" />
        <Metric label="Воронка за 90 дней" value={`${f.created} → ${f.deposit} → ${f.paid}`} note={`предоплата ${percent(f.deposit, f.created)}, полная оплата ${percent(f.paid, f.created)}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Ближайшие праздники" aside={<Link href={ordersHref({ status: BEFORE_PRINT, sort: 'deadline' })}>Все</Link>} flush>
            <OrdersTable items={deadlines} empty="Нет заказов с датой праздника" compact />
          </Panel>
          <Panel title="Новые заказы" aside={<Link href={ordersHref({ sort: 'created' })}>Все</Link>} flush>
            <OrdersTable items={latest} empty="Заказов пока нет" compact />
          </Panel>
        </div>
        <Panel title="По продуктам" flush className="self-start">
          <Table minWidth={0}>
            <thead>
              <tr>
                <Th>Продукт</Th>
                <Th className="text-right">Заказов</Th>
                <Th className="text-right">Оплачено</Th>
              </tr>
            </thead>
            <tbody>
              {stats.byProduct.map((p) => (
                <tr key={p.productId}>
                  <Td>
                    <Link href={ordersHref({ productId: p.productId })} className="hover:underline">
                      {getBrand(p.productId).name}
                    </Link>
                  </Td>
                  <Td className="text-right">
                    {p.orders}
                    <span className="ml-1 text-[12px] text-muted">/ {p.paidOrders}</span>
                  </Td>
                  <Td className="text-right">{formatTenge(p.revenue)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="px-3 py-2.5 text-[12px] text-muted">Заказов: всего / полностью оплачено. Отменённые не учитываются.</p>
        </Panel>
      </div>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1 text-[22px] font-semibold tracking-[-0.01em]">{value}</p>
      <p className="mt-0.5 text-[12px] text-muted">{note}</p>
    </div>
  );
}
