import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/** White block with an optional title row. `flush` drops the body padding for tables and lists. */
export function Panel({
  title,
  description,
  aside,
  children,
  flush,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-card border border-line bg-surface shadow-[0_1px_2px_rgba(24,24,27,0.04)]', className)}>
      {title && (
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-5 py-2.5">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold">{title}</h2>
            {description && <p className="text-[12px] text-muted">{description}</p>}
          </div>
          {aside && <div className="shrink-0 text-[13px] text-muted">{aside}</div>}
        </div>
      )}
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

/** Label / value rows inside a panel. */
export function Facts({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(96px,auto)_1fr] gap-x-4 gap-y-2.5">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-muted">{children}</p>;
}

/** Link in a panel's title row. */
export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="rounded-[6px] px-2 py-1 text-[13px] text-zinc-600 hover:bg-bg hover:text-ink">
      {children}
    </a>
  );
}
