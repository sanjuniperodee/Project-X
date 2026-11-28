'use client';

import { useEffect } from 'react';
import type { LayoutPage } from '@px/contracts';
import { cn } from '@/shared/lib/cn';

/** Cover alone, then left–right pairs, the back cover alone; sheets of other sizes one by one. */
export function toSpreads(pages: LayoutPage[]): LayoutPage[][] {
  const book = pages.length > 2 && pages.every((p) => p.widthMm === pages[0]!.widthMm && p.heightMm === pages[0]!.heightMm);
  if (!book) return pages.map((p) => [p]);
  const groups: LayoutPage[][] = [[pages[0]!]];
  for (let i = 1; i < pages.length - 1; i += 2) groups.push(pages.slice(i, Math.min(i + 2, pages.length - 1)));
  groups.push([pages.at(-1)!]);
  return groups;
}

/** The finished layout on the dark stage: one spread at a time, arrows, keys and a filmstrip. */
export function IssueViewer({ pages, index, onIndex }: { pages: LayoutPage[]; index: number; onIndex: (index: number) => void }) {
  const spreads = toSpreads(pages);
  const at = Math.min(index, spreads.length - 1);
  const spread = spreads[at] ?? [];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea')) return;
      if (event.key === 'ArrowRight') onIndex(Math.min(spreads.length - 1, at + 1));
      if (event.key === 'ArrowLeft') onIndex(Math.max(0, at - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [at, spreads.length, onIndex]);

  const arrow = 'grid size-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-lg backdrop-blur-md transition-colors hover:bg-white/15 disabled:opacity-25';
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 sm:gap-5">
        <button type="button" className={cn(arrow, 'max-sm:hidden')} disabled={at === 0} onClick={() => onIndex(at - 1)} aria-label="Предыдущий разворот">
          ←
        </button>
        <figure key={at} className="voice-rise flex h-full min-h-0 max-w-full items-center justify-center drop-shadow-[0_30px_60px_rgba(0,0,0,0.6)]">
          {spread.map((page) => (
            // eslint-disable-next-line @next/next/no-img-element -- generated SVG preview
            <img
              key={page.number}
              src={page.previewUrl}
              alt={`Страница ${page.number}`}
              width={page.widthMm}
              height={page.heightMm}
              className="h-auto max-h-full w-auto min-w-0 bg-white object-contain"
              style={{ maxWidth: `${100 / spread.length}%` }}
            />
          ))}
        </figure>
        <button type="button" className={cn(arrow, 'max-sm:hidden')} disabled={at >= spreads.length - 1} onClick={() => onIndex(at + 1)} aria-label="Следующий разворот">
          →
        </button>
      </div>

      <nav aria-label="Все страницы" className="mx-auto max-w-full overflow-x-auto px-3 pb-1">
        <ol className="flex min-w-max items-end gap-2">
          {spreads.map((group, i) => (
            <li key={group[0]!.number}>
              <button
                type="button"
                onClick={() => onIndex(i)}
                aria-current={i === at ? 'page' : undefined}
                aria-label={group.length > 1 ? `Страницы ${group[0]!.number}–${group.at(-1)!.number}` : `Страница ${group[0]!.number}`}
                className={cn('flex gap-px rounded-[6px] p-0.5 ring-1 transition-all', i === at ? 'bg-white ring-white' : 'opacity-60 ring-white/20 hover:opacity-100')}
              >
                {group.map((page) => (
                  // eslint-disable-next-line @next/next/no-img-element -- generated SVG preview
                  <img key={page.number} src={page.previewUrl} alt="" loading="lazy" width={page.widthMm} height={page.heightMm} className="h-14 w-auto bg-white sm:h-16" />
                ))}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
