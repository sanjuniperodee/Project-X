import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/cn';

/** Small secondary action used in page headers and panels. */
export function ActionLink({ className, primary, ...props }: ComponentProps<typeof Link> & { primary?: boolean }) {
  return (
    <Link
      className={cn(
        'inline-flex h-8 items-center rounded-control border px-3 text-[13px] whitespace-nowrap',
        primary ? 'border-ink bg-ink text-white hover:bg-ink/90' : 'border-line bg-surface hover:bg-bg',
        className,
      )}
      {...props}
    />
  );
}
