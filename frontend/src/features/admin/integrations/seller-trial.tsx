'use client';

import { useActionState } from 'react';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/form';
import { Notice } from '@/shared/ui/notice';
import { trySeller, type TrialState } from './actions';

const initial: TrialState = { messages: [], actions: [], error: null };

/** Talk to the AI seller as a customer: real model and prices, no orders or invoices. */
export function SellerTrial() {
  const [state, action, pending] = useActionState(trySeller, initial);
  return (
    <div className="flex flex-col gap-4">
      {state.messages.length > 0 && (
        <ol className="flex flex-col gap-2 rounded-card bg-bg p-4">
          {state.messages.map((m, i) => (
            <li key={i} className={m.author === 'customer' ? 'self-end rounded-control bg-accent/10 px-3 py-2' : 'self-start rounded-control bg-surface px-3 py-2'}>
              <span className="whitespace-pre-wrap">{m.text}</span>
            </li>
          ))}
        </ol>
      )}
      {state.actions.length > 0 && (
        <Notice tone="info" title="Что бот сделал бы по-настоящему">
          {state.actions.join('; ')}
        </Notice>
      )}
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <form action={action} className="flex flex-col gap-3">
        <Textarea name="text" rows={2} placeholder="Напишите как клиент: «Здравствуйте, хочу подарок подруге на день рождения»" />
        <div className="flex gap-3">
          <Button type="submit" loading={pending}>
            Отправить
          </Button>
          {state.messages.length > 0 && (
            <Button type="submit" name="reset" value="1" variant="secondary">
              Начать заново
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
