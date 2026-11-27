import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@px/contracts';
import { cn } from '@/shared/lib/cn';

const PATH: { status: ProjectStatus; label: string }[] = [
  { status: 'draft', label: 'Предоплата' },
  { status: 'deposit_paid', label: 'Материалы' },
  { status: 'in_design', label: 'Вёрстка' },
  { status: 'awaiting_approval', label: 'Согласование' },
  { status: 'paid', label: 'Оплата' },
  { status: 'printing', label: 'Печать' },
  { status: 'shipped', label: 'Доставка' },
  { status: 'delivered', label: 'Готово' },
];

/** The order's journey. Statuses are a real sequence, so they are numbered. */
export function StatusTimeline({ status }: { status: ProjectStatus }) {
  if (status === 'cancelled') {
    return <p className="font-medium text-danger">{PROJECT_STATUS_LABELS.cancelled}</p>;
  }
  const current = PATH.findIndex((p) => p.status === status);
  return (
    <div>
      <p className="text-lg font-medium">{PROJECT_STATUS_LABELS[status]}</p>
      <ol className="mt-4 flex gap-1" aria-label="Этапы заказа">
        {PATH.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step.status} className="min-w-0 flex-1" aria-current={active ? 'step' : undefined}>
              <span className={cn('block h-1.5 rounded-full', done || active ? 'bg-ink' : 'bg-ink/15')} />
              <span className={cn('mt-2 hidden truncate text-xs sm:block', active ? 'font-semibold text-ink' : 'text-muted')}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
