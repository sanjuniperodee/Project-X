'use client';

import { useActionState } from 'react';
import { manualTransitions, PROJECT_STATUS_LABELS, PROJECT_TRANSITIONS, type ProjectStatus } from '@px/contracts';
import { Button } from '@/shared/ui/button';
import { FieldShell, Select, Textarea } from '@/shared/ui/form';
import { Notice } from '@/shared/ui/notice';
import { changeStatus } from './actions';

/** Studio-controlled status changes (design, approval, printing, delivery, cancellation). */
export function StatusForm({ projectId, status }: { projectId: string; status: ProjectStatus }) {
  const [state, action, pending] = useActionState(changeStatus.bind(null, projectId), { error: null });
  const options = manualTransitions(status);

  if (options.length === 0) {
    return (
      <p className="text-muted">
        {PROJECT_TRANSITIONS[status].length === 0
          ? 'Заказ завершён, статус больше не меняется.'
          : 'Следующий статус выставится автоматически после оплаты клиентом.'}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <FieldShell id="status-to" label="Новый статус" required>
        <Select id="status-to" name="to" defaultValue={options[0]}>
          {options.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </FieldShell>
      <FieldShell id="status-note" label="Комментарий для клиента">
        <Textarea id="status-note" name="note" rows={3} maxLength={500} />
      </FieldShell>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <div>
        <Button type="submit" loading={pending}>
          Сменить статус
        </Button>
      </div>
    </form>
  );
}
