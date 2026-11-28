import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { getBrand } from '@/brands';
import { SITE } from '@/shared/config/site';
import type { Scope } from '../scope/projects';
import { project } from '../scope/projects';
import { Icons } from '../ui/icons';
import { CommandPalette, SearchButton } from './command-palette';
import { Nav, type NavItem } from './nav';
import { ScopeSwitcher } from './scope-switcher';
import { SearchButtonCompact } from './search-button-compact';

export interface ShellCounts {
  /** Work that needs a person now (in the current project or all of them). */
  attention: number;
  /** Chats waiting for the studio. */
  chats: number;
  /** Orders in work, per project and in total, for the switcher. */
  active: Record<string, number> & { all: number };
}

/**
 * Back-office frame. Left: the project switcher, search and sections with their counters;
 * on narrow screens they fold into a top bar with a scrollable row of sections.
 * In one project's mode a thin bar in the project's colour runs along the top of the page.
 */
export function AdminShell({ children, counts, scope }: { children: ReactNode; counts: ShellCounts; scope: Scope }) {
  const groups: Array<{ label?: string; items: NavItem[] }> = [
    {
      items: [
        { href: '/admin', label: 'Сводка', icon: 'overview', exact: true, count: counts.attention, countTitle: 'Требуют действия', urgent: true },
        { href: '/admin/orders', label: 'Заказы', icon: 'orders', count: scope ? counts.active[scope] : counts.active.all, countTitle: 'В работе' },
        { href: '/admin/customers', label: 'Клиенты', icon: 'customers' },
      ],
    },
    {
      label: 'Студия',
      items: [
        { href: '/admin/chats', label: 'Чаты', icon: 'chats', count: counts.chats, countTitle: 'Ждут ответа студии', urgent: true },
        { href: '/admin/catalog', label: 'Каталог WhatsApp', icon: 'catalog' },
        { href: '/admin/usage', label: 'Расходы ИИ', icon: 'usage' },
        { href: '/admin/settings', label: 'Настройки', icon: 'settings' },
      ],
    },
  ];
  const site = scope ? { href: `/${scope}`, label: `Сайт ${getBrand(scope).name}` } : { href: '/', label: 'Сайт студии' };

  return (
    <div data-area="admin" className="min-h-dvh bg-bg text-ink lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="sticky top-0 z-30 border-b border-line bg-[#fafafa] lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2 px-3 pt-3 pb-2 lg:block lg:pt-4">
          <Link href="/admin" className="hidden px-1 pb-3 text-[13px] text-muted lg:block">
            <span className="font-semibold text-ink">{SITE.name}</span> студия
          </Link>
          <div className="min-w-0 flex-1">
            <Suspense>
              <ScopeSwitcher scope={scope} counts={counts.active} />
            </Suspense>
          </div>
          <div className="lg:mt-2">
            <span className="hidden lg:block">
              <SearchButton />
            </span>
            <SearchIconButton />
          </div>
        </div>
        <Nav groups={groups} />
        <div className="mt-auto hidden px-3 py-3 lg:block">
          <a href={site.href} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-2.5 rounded-[8px] px-2.5 text-zinc-600 hover:bg-zinc-200/60 hover:text-ink">
            <Icons.external className="text-zinc-500" />
            {site.label}
          </a>
        </div>
      </aside>
      <div className="min-w-0">
        {scope && <div aria-hidden className="h-[3px]" style={{ background: project(scope).color }} />}
        <main className="mx-auto max-w-[1480px] px-4 py-5 lg:px-9 lg:py-8">{children}</main>
      </div>
      <CommandPalette scope={scope} />
    </div>
  );
}

function SearchIconButton() {
  return (
    <span className="lg:hidden">
      <SearchButtonCompact />
    </span>
  );
}
