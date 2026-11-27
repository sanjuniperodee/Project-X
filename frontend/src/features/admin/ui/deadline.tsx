import { cn } from '@/shared/lib/cn';
import { daysUntil, formatDay } from '../lib/format';

/** Gift date with the days left; red within a week, amber within two, muted once past or done. */
export function Deadline({ date, done }: { date: string | null; done?: boolean }) {
  if (!date) return <span className="text-muted">—</span>;
  const days = daysUntil(date);
  const left = days < 0 ? 'прошла' : days === 0 ? 'сегодня' : `через ${days} дн`;
  return (
    <span className="whitespace-nowrap">
      {formatDay(date)}
      <span
        className={cn(
          'ml-1.5 text-[12px]',
          done || days < 0 ? 'text-muted' : days <= 7 ? 'font-medium text-red-700' : days <= 14 ? 'text-amber-700' : 'text-muted',
        )}
      >
        {left}
      </span>
    </span>
  );
}
