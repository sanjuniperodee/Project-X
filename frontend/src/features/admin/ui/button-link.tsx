import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/cn';

/** Small secondary action used in page headers and panels. */
export function ActionLink({ className, primary, ...props }: ComponentProps<typeof Link> & { primary?: boolean }) {
  return (
    <Link
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-control border px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors',
        primary ? 'border-ink bg-ink text-white hover:bg-zinc-700' : 'border-line bg-surface hover:border-zinc-300 hover:bg-zinc-50',
        className,
      )}
      {...props}
    />
  );
}
