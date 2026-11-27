import { useId } from 'react';
import { cn } from '@/shared/lib/cn';

/** Қошқар мүйіз (ram's horn): the classic Kazakh ornament unit, drawn as a single stroke. */
const HORN =
  'M30 24V31M30 24C30 12 19 5 11 9C5 12 6 20 12 21C16 22 18 18 16 15M30 24C30 12 41 5 49 9C55 12 54 20 48 21C44 22 42 18 44 15';

export function OrnamentMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 34" className={cn('h-6 w-auto', className)} aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d={HORN} />
    </svg>
  );
}

/** Repeating ornament band, used as section dividers. */
export function OrnamentBand({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg className={cn('block h-8 w-full', className)} aria-hidden>
      <defs>
        <pattern id={id} width="72" height="32" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" transform="translate(6 0)">
            <path d={HORN} />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
