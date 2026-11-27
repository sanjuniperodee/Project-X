import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatTenge } from '@px/contracts';
import { formatDateTime, formatPhone, whatsappLink } from '@/features/admin/lib/format';
import { OrdersTable } from '@/features/admin/orders/orders-table';
import { ActionLink } from '@/features/admin/ui/button-link';
import { PageHeader } from '@/features/admin/ui/page-header';
import { Facts, Panel } from '@/features/admin/ui/panel';
import { api } from '@/shared/api/server';

/** One customer: contacts, money, every order and the WhatsApp conversation if there is one. */
export default async function CustomerPage({ params }: { params: Promise<{ phone: string }> }) {
  const phone = (await params).phone.replace(/\D/g, '');
  if (phone.length < 10) notFound();
  const [orders, chats] = await Promise.all([
    api.admin.projects({ phone, sort: 'created', limit: 200 }),
    api.admin.conversations.list().catch(() => []),
  ]);
  if (orders.total === 0) notFound();
  const latest = orders.items[0]!;
  const chat = chats.find((c) => c.phone?.replace(/\D/g, '') === phone);
  const paid = orders.items.reduce((sum, o) => sum + o.paidAmount, 0);
  const total = orders.items.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: '/admin/customers', label: 'Клиенты' }}
        title={latest.customerName}
        description={formatPhone(phone)}
        actions={
          <>
            {chat && <ActionLink href={`/admin/chats/${chat.id}`}>Переписка</ActionLink>}
            <ActionLink href={whatsappLink(phone)} target="_blank" primary>
              Написать в WhatsApp
            </ActionLink>
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Panel title="Заказы" aside={orders.total} flush className="min-w-0">
          <OrdersTable items={orders.items} empty="Заказов нет" hideCustomer />
        </Panel>
        <Panel title="Итого" className="self-start">
          <Facts
            items={[
              ['Заказов', String(orders.total)],
              ['На сумму', formatTenge(total)],
              ['Оплатил', formatTenge(paid)],
              ['Первый заказ', formatDateTime(orders.items.at(-1)!.createdAt)],
              ['Чат', chat ? <Link key="chat" href={`/admin/chats/${chat.id}`} className="underline underline-offset-2">{chat.mode === 'human' ? 'ведёт студия' : 'ведёт бот'}</Link> : <span key="no" className="text-muted">не писал</span>],
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}
