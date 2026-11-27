import Link from 'next/link';
import { api } from '@/shared/api/server';

export const dynamic = 'force-dynamic';

const time = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

export default async function ChatsPage() {
  const chats = await api.admin.conversations.list();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold">Чаты WhatsApp</h1>
      {chats.length === 0 ? (
        <p className="text-muted">Пока никто не писал.</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {chats.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/chats/${c.id}`} className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-bg">
                <span className="min-w-0">
                  <span className="font-medium">{c.name || (c.phone ? `+${c.phone}` : 'Скрытый номер')}</span>
                  {c.mode === 'human' && (
                    <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">{c.handoffReason ? 'нужен человек' : 'отвечает студия'}</span>
                  )}
                  <span className="mt-0.5 block truncate text-sm text-muted">{c.lastMessage}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {time(c.lastMessageAt)}
                  {c.projectsCount > 0 && <span className="block text-right">заказов: {c.projectsCount}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
