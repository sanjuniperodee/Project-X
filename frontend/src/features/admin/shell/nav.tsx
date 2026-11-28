'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/cn';
import { Icons } from '../ui/icons';

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof Icons;
  exact?: boolean;
  count?: number;
  countTitle?: string;
  /** Counts that need a person now are dark; plain totals are quiet. */
  urgent?: boolean;
}

export function Nav({ groups }: { groups: Array<{ label?: string; items: NavItem[] }> }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Разделы" className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:gap-4 lg:overflow-visible lg:pb-0">
      {groups.map((group, g) => (
        <div key={g} className="flex gap-1 lg:flex-col lg:gap-0.5">
          {group.label && <p className="hidden px-2.5 pb-1 text-[12px] text-muted lg:block">{group.label}</p>}
          {group.items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = Icons[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-9 shrink-0 items-center gap-2.5 rounded-[8px] px-2.5 whitespace-nowrap transition-colors',
                  active ? 'bg-ink text-white' : 'text-zinc-600 hover:bg-zinc-200/60 hover:text-ink',
                )}
              >
                <Icon className={cn('shrink-0', active ? 'text-white' : 'text-zinc-500')} />
                <span className="flex-1">{item.label}</span>
                {item.count ? (
                  <span
                    title={item.countTitle}
                    className={cn(
                      'min-w-5 rounded-full px-1.5 text-center text-[12px] leading-5 font-medium tabular-nums',
                      active ? 'bg-white/20 text-white' : item.urgent ? 'bg-ink text-white' : 'bg-zinc-200 text-zinc-700',
                    )}
                  >
                    {item.count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
