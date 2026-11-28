'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { LayoutPage, ProductId } from '@px/contracts';
import { useBrandId } from '@/shared/lib/brand-context';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';

const loadMockup = () => import('./mockup-3d');
// The 3D model is its own chunk, fetched only when the customer opens the tab (or points at it).
const Mockup3D = dynamic(() => loadMockup().then((m) => m.Mockup3D), {
  ssr: false,
  loading: () => <div aria-hidden className="aspect-square w-full animate-pulse rounded-card bg-ink/5 sm:aspect-[5/4]" />,
});

type Mode = 'pages' | '3d';

/**
 * Page previews of a layout, flat or as the printed product in 3D. `productId` defaults to the brand of the page.
 */
export function LayoutPages({ pages, spreads, productId }: { pages: LayoutPage[]; spreads: boolean; productId?: ProductId }) {
  const brand = useBrandId();
  const product = productId ?? brand ?? (spreads ? 'glossy' : 'boardgame');
  const [mode, setMode] = useState<Mode>('pages');
  const tabs: Array<{ id: Mode; label: string }> = [
    { id: 'pages', label: spreads ? 'Развороты' : 'Страницы' },
    { id: '3d', label: '3D' },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Как показать макет" className="inline-flex self-start rounded-control border-2 border-ink/15 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={mode === tab.id}
            onClick={() => setMode(tab.id)}
            onPointerEnter={tab.id === '3d' ? () => void loadMockup() : undefined}
            onFocus={tab.id === '3d' ? () => void loadMockup() : undefined}
            className={cn(
              'min-h-10 rounded-control px-4 text-[15px] font-medium transition-colors',
              mode === tab.id ? 'bg-ink text-bg' : 'text-muted hover:text-ink',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{mode === '3d' ? <Mockup3D pages={pages} productId={product} /> : <FlatPages pages={pages} spreads={spreads} />}</div>
    </div>
  );
}

/**
 * Books and magazines are shown as spreads (cover alone, then pairs), card sheets and boards one by one.
 * Previews are self-contained SVGs, so a plain <img> shows them.
 */
function FlatPages({ pages, spreads }: { pages: LayoutPage[]; spreads: boolean }) {
  const groups = spreads ? toSpreads(pages) : pages.map((p) => [p]);
  const [index, setIndex] = useState(0);
  const current = groups[Math.min(index, groups.length - 1)] ?? [];
  const label =
    current.length > 1
      ? `Страницы ${current[0]!.number}–${current.at(-1)!.number} из ${pages.length}`
      : `Страница ${current[0]?.number ?? 0} из ${pages.length}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-stretch justify-center gap-0 rounded-card bg-ink/5 p-3 sm:p-6">
        {current.map((page) => (
          <figure key={page.number} className="flex min-w-0 justify-center" style={{ maxWidth: current.length > 1 ? '50%' : '100%' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG preview */}
            <img
              src={page.previewUrl}
              alt={`Страница ${page.number}`}
              width={page.widthMm}
              height={page.heightMm}
              className="h-auto max-h-[78vh] w-auto max-w-full bg-surface shadow-[0_6px_24px_rgb(0_0_0/0.18)]"
            />
          </figure>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4">
        <Button variant="secondary" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
          ← Назад
        </Button>
        <p className="text-[15px] text-muted tabular-nums" aria-live="polite">
          {label}
        </p>
        <Button variant="secondary" disabled={index >= groups.length - 1} onClick={() => setIndex((i) => Math.min(groups.length - 1, i + 1))}>
          Дальше →
        </Button>
      </div>

      <nav aria-label="Все страницы макета" className="-mx-1 overflow-x-auto px-1 pb-2">
        <ol className="flex min-w-max gap-3">
          {groups.map((group, i) => (
            <li key={group[0]!.number}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index ? 'page' : undefined}
                aria-label={group.length > 1 ? `Страницы ${group[0]!.number}–${group.at(-1)!.number}` : `Страница ${group[0]!.number}`}
                className={cn(
                  'flex gap-px rounded-control border-2 p-1 transition-colors',
                  i === index ? 'border-ink' : 'border-transparent hover:border-line',
                )}
              >
                {group.map((page) => (
                  // eslint-disable-next-line @next/next/no-img-element -- generated SVG preview
                  <img key={page.number} src={page.previewUrl} alt="" loading="lazy" className="h-24 w-auto bg-surface" width={page.widthMm} height={page.heightMm} />
                ))}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}

/** Cover alone, then left–right pairs, the back cover alone. */
function toSpreads(pages: LayoutPage[]): LayoutPage[][] {
  if (pages.length <= 1) return [pages];
  const groups: LayoutPage[][] = [[pages[0]!]];
  for (let i = 1; i < pages.length - 1; i += 2) groups.push(pages.slice(i, Math.min(i + 2, pages.length - 1)));
  groups.push([pages.at(-1)!]);
  return groups;
}
