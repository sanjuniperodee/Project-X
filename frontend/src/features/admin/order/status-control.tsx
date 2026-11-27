'use client';

import { useActionState } from 'react';
import { manualTransitions, PROJECT_TRANSITIONS, type ProjectStatus } from '@px/contracts';
import { changeStatus, type ActionState } from '../actions';
import { STATUS_LABEL } from '../lib/status';

/** Manual status change. Payment-driven statuses are not offered: payments set them. */
export function StatusControl({ projectId, status }: { projectId: string; status: ProjectStatus }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(changeStatus.bind(null, projectId), { error: null });
  const options = manualTransitions(status);

  if (options.length === 0) {
    return (
      <p className="text-muted">
        {PROJECT_TRANSITIONS[status].length === 0 ? 'Заказ закрыт, статус больше не меняется.' : 'Следующий статус выставит оплата клиента.'}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <select name="to" required defaultValue="" aria-label="Новый статус" className="h-8 rounded-control border border-line bg-surface px-2">
        <option value="" disabled>
          Перевести в…
        </option>
        {options.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <input name="note" placeholder="Комментарий для истории (необязательно)" maxLength={500} className="h-8 rounded-control border border-line bg-surface px-2.5 placeholder:text-muted" />
      <button type="submit" disabled={pending} className="h-8 rounded-control bg-ink px-3 text-white hover:bg-ink/90 disabled:opacity-50">
        {pending ? 'Сохраняем…' : 'Сменить статус'}
      </button>
      {state.error && (
        <p role="alert" className="text-[13px] text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
