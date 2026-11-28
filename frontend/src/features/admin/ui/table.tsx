import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

/** Dense data table: quiet header, hairline rows, numbers right-aligned by the caller. */
export function Table({ children, minWidth = 720 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('h-10 border-b border-line bg-zinc-50 px-4 text-[12px] font-medium text-muted first:pl-5 last:pr-5', className)} {...props} />;
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('h-14 border-b border-line px-4 align-middle first:pl-5 last:pr-5 group-last:border-b-0', className)} {...props} />;
}

/** A row that opens a page: the whole row is the link target (the link stretches over it). */
export const rowLink = 'group relative transition-colors hover:bg-zinc-50';
export const stretchedLink = 'after:absolute after:inset-0 after:content-[""] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ink';
