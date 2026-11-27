import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBrand } from '@/brands';
import { setChatMode } from '@/features/admin/chats/actions';
import { ReplyForm } from '@/features/admin/chats/reply-form';
import { formatDateTime, formatPhone } from '@/features/admin/lib/format';
import { PageHeader } from '@/features/admin/ui/page-header';
import { Panel } from '@/features/admin/ui/panel';
import { ApiError } from '@/shared/api/core';
import { api } from '@/shared/api/server';
import { cn } from '@/shared/lib/cn';
import { PRODUCT_IDS, type ProductId } from '@px/contracts';

const AUTHOR = { customer: 'Клиент', bot: 'ИИ-продажник', studio: 'Студия', system: 'Уведомление' } as const;

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chat = await api.admin.conversations.get(id).catch((error: unknown) => {
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  });
  const nextMode = chat.mode === 'bot' ? 'human' : 'bot';
  const title = chat.name || (chat.phone ? formatPhone(chat.phone) : 'Скрытый номер');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: '/admin/chats', label: 'Чаты' }}
        title={title}
        description={chat.mode === 'bot' ? 'Отвечает ИИ-продажник' : 'Отвечает студия, бот на паузе'}
        actions={
          <form action={setChatMode.bind(null, chat.id, nextMode)}>
            <button type="submit" className="h-8 rounded-control border border-line bg-surface px-3 text-[13px] hover:bg-bg">
              {chat.mode === 'bot' ? 'Забрать чат у бота' : 'Вернуть чат боту'}
            </button>
          </form>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <Panel flush>
          {chat.mode === 'human' && chat.handoffReason && (
            <p className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-amber-900">Бот передал чат студии: {chat.handoffReason}</p>
          )}
          <ol className="flex max-h-[65dvh] flex-col gap-2 overflow-y-auto p-4">
            {chat.messages.map((m) => (
              <li
                key={m.id}
                className={cn(
                  'max-w-[80%] rounded-control px-3 py-2',
                  m.author === 'customer' ? 'self-start border border-line bg-surface' : m.author === 'system' ? 'self-center bg-bg text-[13px] text-muted' : 'self-end bg-zinc-100',
                )}
              >
                <span className="block text-[11px] text-muted">
                  {AUTHOR[m.author]} · {formatDateTime(m.createdAt)}
                </span>
                <span className="whitespace-pre-wrap">{m.text}</span>
              </li>
            ))}
          </ol>
          <div className="border-t border-line p-4">
            <ReplyForm id={chat.id} />
          </div>
        </Panel>
        <Panel title="Заказы клиента" className="self-start">
          {chat.projects.length === 0 ? (
            <p className="text-muted">Заказов пока нет.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {chat.projects.map((p) => (
                <li key={p.projectId}>
                  <Link href={`/admin/orders/${p.projectId}`} className="underline underline-offset-2">
                    {(PRODUCT_IDS as readonly string[]).includes(p.productId) ? getBrand(p.productId as ProductId).name : p.productId}
                  </Link>
                  <span className="ml-2 font-mono text-[12px] text-muted">#{p.projectId.slice(0, 8)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
