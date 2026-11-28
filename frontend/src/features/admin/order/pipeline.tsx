import type { ProjectStatus, StatusChange } from '@px/contracts';
import { cn } from '@/shared/lib/cn';
import { formatDateTime } from '../lib/format';
import { PIPELINE, STATUS_LABEL } from '../lib/status';

/** The order's road from the first click to the gift in hands; done stages carry their date. */
export function Pipeline({ status, history }: { status: ProjectStatus; history: Array<Pick<StatusChange, 'to' | 'createdAt'>> }) {
  if (status === 'cancelled') {
    return <p className="rounded-card border border-red-200 bg-red-50 px-5 py-3 text-[13px] text-red-800">Заказ отменён</p>;
  }
  const at = PIPELINE.indexOf(status);
  const reached = (s: ProjectStatus) => [...history].reverse().find((h) => h.to === s)?.createdAt;
  return (
    <ol aria-label="Этапы заказа" className="grid grid-cols-4 gap-x-2 gap-y-4 rounded-card border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04)] sm:grid-cols-8">
      {PIPELINE.map((s, i) => {
        const done = i < at;
        const current = i === at;
        const date = done || current ? reached(s) : undefined;
        return (
          <li key={s} aria-current={current ? 'step' : undefined} className="flex min-w-0 flex-col gap-2">
            {/* Done: full; current: half way through; ahead: empty. */}
            <span className={cn('h-1.5 rounded-full', done ? 'bg-ink' : current ? 'bg-[linear-gradient(90deg,var(--c-ink)_55%,#e4e4e7_55%)]' : 'bg-zinc-200')} />
            <span className={cn('text-[12px] leading-tight', current ? 'font-semibold text-ink' : done ? 'text-ink' : 'text-muted')}>{STATUS_LABEL[s]}</span>
            {date && <span className="-mt-1 text-[11px] text-muted">{formatDateTime(date)}</span>}
          </li>
        );
      })}
    </ol>
  );
}
