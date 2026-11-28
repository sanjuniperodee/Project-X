'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
import { switchScope } from '../scope/actions';
import { ProjectMark } from '../scope/project-mark';
import { PROJECTS, type Scope } from '../scope/projects';
import { Icons } from '../ui/icons';

export interface ScopeOption {
  /** Orders in work, shown next to each project. */
  active: number;
}

/**
 * The project the back office looks at: one of the studio's projects or all of them together.
 * Every section (overview, orders, customers, catalog) follows it.
 */
export function ScopeSwitcher({ scope, counts }: { scope: Scope; counts: Record<string, number> & { all: number } }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const pathname = usePathname();
  const search = useSearchParams();
  const box = useRef<HTMLDivElement>(null);
  const current = scope ? PROJECTS.find((p) => p.id === scope)! : null;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  const choose = (value: string) => {
    setOpen(false);
    const here = `${pathname}${search.size ? `?${search}` : ''}`;
    start(() => switchScope(value, here));
  };

  const options = [{ id: null, name: 'Все проекты', note: 'Общий режим' }, ...PROJECTS.map((p) => ({ id: p.id, name: p.name, note: null }))];
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-[10px] border border-line bg-surface px-2 py-1.5 text-left transition-colors hover:border-zinc-300',
          pending && 'opacity-60',
        )}
      >
        <ProjectMark id={scope} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] leading-tight font-semibold">{current?.name ?? 'Все проекты'}</span>
          <span className="block text-[12px] leading-tight text-muted">{scope ? `в работе ${counts[scope] ?? 0}` : `в работе ${counts.all}`}</span>
        </span>
        <Icons.chevrons className="shrink-0 text-muted" />
      </button>

      {open && (
        <ul role="listbox" aria-label="Проект" className="absolute inset-x-0 top-full z-40 mt-1.5 overflow-hidden rounded-[10px] border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgba(24,24,27,0.18)]">
          {options.map((o, i) => {
            const selected = o.id === scope;
            return (
              <li key={o.id ?? 'all'} role="none" className={cn(i === 0 && 'mb-1 border-b border-line pb-1')}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => choose(o.id ?? 'all')}
                  className="flex w-full items-center gap-2.5 rounded-[7px] px-2 py-1.5 text-left hover:bg-bg"
                >
                  <ProjectMark id={o.id} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{o.name}</span>
                    {o.note && <span className="block text-[12px] text-muted">{o.note}</span>}
                  </span>
                  <span className="text-[12px] text-muted tabular-nums">{o.id ? counts[o.id] ?? 0 : counts.all}</span>
                  <Icons.check className={cn('shrink-0', selected ? 'text-ink' : 'invisible')} width={16} height={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
