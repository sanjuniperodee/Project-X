'use client';

import { useActionState } from 'react';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/form';
import { Notice } from '@/shared/ui/notice';
import { replyInChat } from './actions';

export function ReplyForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(replyInChat.bind(null, id), { error: null });
  return (
    <form action={action} className="flex flex-col gap-3">
      <Textarea name="text" rows={3} maxLength={4000} placeholder="Ответ от студии (бот в этом чате встанет на паузу)" />
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <div>
        <Button type="submit" loading={pending}>
          Отправить
        </Button>
      </div>
    </form>
  );
}
