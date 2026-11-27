import type { ProjectStatus } from '@px/contracts';
import { cn } from '@/shared/lib/cn';
import { STATUS_LABEL, STATUS_TONE, TONE_DOT } from '../lib/status';

export function StatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span aria-hidden className={cn('size-2 rounded-full', TONE_DOT[STATUS_TONE[status]])} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Quiet tag for secondary attributes (design mode, product). */
export function Tag({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'warning' }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-[4px] border px-1.5 text-[12px] whitespace-nowrap',
        tone === 'warning' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-line bg-bg text-muted',
      )}
    >
      {children}
    </span>
  );
}
