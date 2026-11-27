'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/cn';

export interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
  count?: number;
  countTitle?: string;
}

export function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Разделы" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible lg:px-2 lg:pb-0">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-8 shrink-0 items-center justify-between gap-3 rounded-control px-2.5 whitespace-nowrap',
              active ? 'bg-bg font-medium text-ink' : 'text-muted hover:bg-bg hover:text-ink',
            )}
          >
            {item.label}
            {item.count ? (
              <span title={item.countTitle} className="min-w-5 rounded-[4px] bg-ink px-1.5 text-center text-[12px] leading-5 text-white">
                {item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
