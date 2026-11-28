'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { formatPhone } from '../lib/format';
import { STATUS_LABEL } from '../lib/status';
import { switchScope } from '../scope/actions';
import { ProjectMark } from '../scope/project-mark';
import { PROJECTS, type Scope } from '../scope/projects';
import { Icons } from '../ui/icons';
import { searchAdmin, type SearchResults } from './search-action';

interface Command {
  id: string;
  group: string;
  title: string;
  note?: string;
  icon: ReactNode;
  run: () => void;
}

const SECTIONS: Array<{ href: string; label: string; icon: keyof typeof Icons }> = [
  { href: '/admin', label: 'Сводка', icon: 'overview' },
  { href: '/admin/orders', label: 'Заказы', icon: 'orders' },
  { href: '/admin/orders?view=board', label: 'Заказы на доске', icon: 'board' },
  { href: '/admin/customers', label: 'Клиенты', icon: 'customers' },
  { href: '/admin/chats', label: 'Чаты WhatsApp', icon: 'chats' },
  { href: '/admin/catalog', label: 'Каталог WhatsApp', icon: 'catalog' },
  { href: '/admin/usage', label: 'Расходы на ИИ', icon: 'usage' },
  { href: '/admin/settings', label: 'Настройки', icon: 'settings' },
];

/** Opens the palette from anywhere: the sidebar button and ⌘K / Ctrl+K dispatch this event. */
export const OPEN_PALETTE = 'px-admin-palette';

/**
 * ⌘K: find an order by hero, customer or phone, a customer, a section, or switch the project,
 * without leaving the keyboard.
 */
export function CommandPalette({ scope }: { scope: Scope }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({ orders: [], customers: [] });
  const [active, setActive] = useState(0);
  const [searching, startSearch] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults({ orders: [], customers: [] });
    setActive(0);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  // Debounced search; stale answers are dropped.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      queueMicrotask(() => setResults({ orders: [], customers: [] }));
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      startSearch(async () => {
        const found = await searchAdmin(q);
        if (current) setResults(found);
      });
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, open]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => {
      close();
      router.push(href);
    };
    const q = query.trim().toLowerCase();
    const matches = (text: string) => !q || text.toLowerCase().includes(q);
    const out: Command[] = [];
    for (const o of results.orders) {
      out.push({
        id: `order:${o.id}`,
        group: 'Заказы',
        title: o.subject,
        note: `${o.customerName}, ${STATUS_LABEL[o.status].toLowerCase()}`,
        icon: <ProjectMark id={o.productId} size={22} />,
        run: go(`/admin/orders/${o.id}`),
      });
    }
    for (const c of results.customers) {
      out.push({
        id: `customer:${c.phone}`,
        group: 'Клиенты',
        title: c.name,
        note: `${formatPhone(c.phone)}, заказов ${c.orders}`,
        icon: <Icons.customers className="text-muted" />,
        run: go(`/admin/customers/${c.phone.replace(/\D/g, '')}`),
      });
    }
    for (const p of [{ id: null, name: 'Все проекты' }, ...PROJECTS]) {
      if (p.id === scope || !matches(`${p.name} проект`)) continue;
      out.push({
        id: `scope:${p.id ?? 'all'}`,
        group: 'Проекты',
        title: p.id ? `Перейти в ${p.name}` : 'Общий режим: все проекты',
        icon: <ProjectMark id={p.id} size={22} />,
        run: () => {
          close();
          void switchScope(p.id ?? 'all', pathname);
        },
      });
    }
    for (const s of SECTIONS) {
      if (!matches(s.label)) continue;
      const Icon = Icons[s.icon];
      out.push({ id: `section:${s.href}`, group: 'Разделы', title: s.label, icon: <Icon className="text-muted" />, run: go(s.href) });
    }
    return out;
  }, [results, query, scope, pathname, router, close]);

  const at = Math.min(active, Math.max(0, commands.length - 1));
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${at}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  if (!open) return null;
  let previousGroup = '';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-900/30 px-3 pt-[12vh] backdrop-blur-[2px]" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal aria-label="Поиск и команды" className="w-full max-w-xl overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_24px_60px_-12px_rgba(24,24,27,0.35)]">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icons.search className="shrink-0 text-muted" />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(commands.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                commands[at]?.run();
              } else if (e.key === 'Escape') close();
            }}
            placeholder="Герой, клиент, телефон или раздел"
            aria-label="Что найти"
            role="combobox"
            aria-expanded
            aria-controls="admin-palette-list"
            aria-activedescendant={commands[at] ? `palette-${at}` : undefined}
            className="h-13 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
          {searching && <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-500" aria-hidden />}
          <kbd className="hidden rounded-[5px] border border-line px-1.5 text-[11px] text-muted sm:block">Esc</kbd>
        </div>
        <ul ref={list} id="admin-palette-list" role="listbox" className="max-h-[56vh] overflow-y-auto p-1.5">
          {commands.length === 0 && <li className="px-3 py-8 text-center text-muted">{query.trim().length < 2 ? 'Начните вводить' : 'Ничего не нашлось'}</li>}
          {commands.map((command, i) => {
            const header = command.group !== previousGroup ? command.group : null;
            previousGroup = command.group;
            return (
              <li key={command.id} role="presentation">
                {header && <p className="px-2.5 pt-2.5 pb-1 text-[12px] text-muted">{header}</p>}
                <button
                  id={`palette-${i}`}
                  role="option"
                  aria-selected={i === at}
                  data-index={i}
                  type="button"
                  onPointerMove={() => setActive(i)}
                  onClick={command.run}
                  className={cn('flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left', i === at && 'bg-bg')}
                >
                  <span className="grid size-6 shrink-0 place-items-center">{command.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{command.title}</span>
                    {command.note && <span className="block truncate text-[12px] text-muted">{command.note}</span>}
                  </span>
                  {i === at && <kbd className="rounded-[5px] border border-line px-1.5 text-[11px] text-muted">↵</kbd>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** The sidebar's search field: opens the palette. */
export function SearchButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE))}
      className="flex h-9 w-full items-center gap-2 rounded-[8px] border border-line bg-surface px-2.5 text-left text-muted transition-colors hover:border-zinc-300 hover:text-ink"
    >
      <Icons.search className="shrink-0" width={16} height={16} />
      <span className="flex-1">Поиск</span>
      <kbd className="rounded-[5px] border border-line px-1.5 font-sans text-[11px]">⌘K</kbd>
    </button>
  );
}
