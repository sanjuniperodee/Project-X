import type { ProjectStatus } from '@px/contracts';
import { cn } from '@/shared/lib/cn';
import { STATUS_LABEL, STATUS_TONE, TONE_DOT, TONE_PILL } from '../lib/status';

/** Status as a tinted pill with a dot: the colour group says who is on the move (us, the customer, done). */
export function StatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const tone = STATUS_TONE[status];
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap', TONE_PILL[tone], className)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', TONE_DOT[tone])} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Quiet tag for secondary attributes (design mode, counts). */
export function Tag({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'warning' }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-[5px] px-1.5 text-[12px] whitespace-nowrap',
        tone === 'warning' ? 'bg-amber-100 text-amber-900' : 'bg-zinc-100 text-zinc-600',
      )}
    >
      {children}
    </span>
  );
}
