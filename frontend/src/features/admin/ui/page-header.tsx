import Link from 'next/link';
import type { ReactNode } from 'react';

/** Title row of a back-office page: breadcrumb, an optional mark, title, a short description and actions. */
export function PageHeader({
  title,
  description,
  back,
  actions,
  mark,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  mark?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
            <span aria-hidden>←</span> {back.label}
          </Link>
        )}
        <div className="mt-1 flex items-center gap-3">
          {mark}
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
        </div>
        {description && <div className="mt-1.5 text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
