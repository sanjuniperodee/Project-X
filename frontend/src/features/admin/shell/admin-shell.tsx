import Link from 'next/link';
import type { ReactNode } from 'react';
import { SITE } from '@/shared/config/site';
import { Nav, type NavItem } from './nav';

/**
 * Back-office frame: a fixed sidebar with the sections and their counters, the page on the right.
 * On narrow screens the sidebar becomes a top bar with a scrollable row of sections.
 */
export function AdminShell({ children, counts }: { children: ReactNode; counts: { attention: number; chats: number } }) {
  const items: NavItem[] = [
    { href: '/admin', label: 'Сводка', exact: true, count: counts.attention, countTitle: 'Требуют действия' },
    { href: '/admin/orders', label: 'Заказы' },
    { href: '/admin/customers', label: 'Клиенты' },
    { href: '/admin/chats', label: 'Чаты', count: counts.chats, countTitle: 'Ждут ответа студии' },
    { href: '/admin/settings', label: 'Настройки' },
  ];
  return (
    <div data-area="admin" className="min-h-dvh bg-bg text-ink lg:grid lg:grid-cols-[224px_1fr]">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex h-12 items-center justify-between px-4 lg:h-14">
          <Link href="/admin" className="font-semibold">
            {SITE.name} <span className="font-normal text-muted">студия</span>
          </Link>
        </div>
        <Nav items={items} />
        <div className="mt-auto hidden border-t border-line px-4 py-3 text-[13px] text-muted lg:block">
          <Link href="/" target="_blank" className="hover:text-ink">
            Открыть сайт
          </Link>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-5 lg:px-8 lg:py-7">{children}</main>
    </div>
  );
}
