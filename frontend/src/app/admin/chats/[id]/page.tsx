import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setChatMode } from '@/features/admin/chats/actions';
import { ReplyForm } from '@/features/admin/chats/reply-form';
import { api } from '@/shared/api/server';
import { ApiError } from '@/shared/api/core';
import { Button } from '@/shared/ui/button';
import { Notice } from '@/shared/ui/notice';

export const dynamic = 'force-dynamic';

const AUTHOR = { customer: 'Клиент', bot: 'ИИ-продажник', studio: 'Студия', system: 'Уведомление' } as const;

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chat = await api.admin.conversations.get(id).catch((error: unknown) => {
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  });
  const nextMode = chat.mode === 'bot' ? 'human' : 'bot';
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold">{chat.name || (chat.phone ? `+${chat.phone}` : 'Скрытый номер')}</h1>
        <form action={setChatMode.bind(null, chat.id, nextMode)}>
          <Button type="submit" variant="secondary">
            {chat.mode === 'bot' ? 'Забрать чат у бота' : 'Вернуть чат боту'}
          </Button>
        </form>
      </div>
      {chat.mode === 'human' && chat.handoffReason && <Notice tone="danger" title="Бот передал чат студии">{chat.handoffReason}</Notice>}
      {chat.projects.length > 0 && (
        <p className="text-sm text-muted">
          Заказы:{' '}
          {chat.projects.map((p, i) => (
            <span key={p.projectId}>
              {i > 0 && ', '}
              <Link href={`/admin/${p.projectId}`} className="underline underline-offset-4">
                {p.productId}
              </Link>
            </span>
          ))}
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {chat.messages.map((m) => (
          <li key={m.id} className={m.author === 'customer' ? 'self-start rounded-control bg-surface px-3 py-2' : 'self-end rounded-control bg-accent/10 px-3 py-2'}>
            <span className="block text-xs text-muted">{AUTHOR[m.author]}</span>
            <span className="whitespace-pre-wrap">{m.text}</span>
          </li>
        ))}
      </ol>
      <ReplyForm id={chat.id} />
    </div>
  );
}
