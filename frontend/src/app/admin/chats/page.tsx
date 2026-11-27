import Link from 'next/link';
import { ago, formatPhone } from '@/features/admin/lib/format';
import { PageHeader } from '@/features/admin/ui/page-header';
import { Empty, Panel } from '@/features/admin/ui/panel';
import { Tag } from '@/features/admin/ui/status-badge';
import { api } from '@/shared/api/server';

export default async function ChatsPage() {
  const chats = await api.admin.conversations.list();
  // Chats waiting for a person first, then by the latest message.
  const sorted = [...chats].sort((a, b) => Number(b.mode === 'human') - Number(a.mode === 'human') || b.lastMessageAt.localeCompare(a.lastMessageAt));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Чаты WhatsApp" description="Переписка ИИ-продажника и студии с клиентами" />
      <Panel flush>
        {sorted.length === 0 ? (
          <Empty>Пока никто не писал на номер студии</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {sorted.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/chats/${c.id}`} className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-bg/70">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.name || (c.phone ? formatPhone(c.phone) : 'Скрытый номер')}</span>
                      {c.mode === 'human' && <Tag tone="warning">{c.handoffReason ? 'нужен человек' : 'отвечает студия'}</Tag>}
                      {c.projectsCount > 0 && <Tag>заказов: {c.projectsCount}</Tag>}
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-muted">{c.lastMessage}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-muted">{ago(c.lastMessageAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
