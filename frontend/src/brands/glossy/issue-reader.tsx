'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { SAMPLE_PAGE_SIZE, sampleSpreads } from './sample-issue';

const SPREADS = sampleSpreads();

/**
 * Leaf through the sample issue spread by spread: swipe or scroll on touch screens,
 * arrows and keyboard on desktop. Native scroll-snap does the paging.
 */
export function IssueReader() {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const goTo = useCallback((next: number) => {
    const el = track.current?.children[Math.max(0, Math.min(SPREADS.length - 1, next))] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, []);

  // Track which spread is centred to update the counter and caption.
  useEffect(() => {
    const root = track.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setIndex(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: 0.6 },
    );
    for (const child of root.children) observer.observe(child);
    return () => observer.disconnect();
  }, []);

  const spread = SPREADS[index]!;
  const caption = [...new Set(spread.map((p) => p.rubric))].join(' · ');
  const pages = spread.map((p) => p.number).join('–');

  return (
    <div
      className="flex flex-col gap-6"
      role="region"
      aria-roledescription="карусель"
      aria-label="Пример номера Cover Me"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') goTo(index + 1);
        if (e.key === 'ArrowLeft') goTo(index - 1);
      }}
    >
      <div
        ref={track}
        tabIndex={0}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto overscroll-x-contain px-[max(1rem,calc(50%-34rem))] pb-4 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glossy-fuchsia [&::-webkit-scrollbar]:hidden"
      >
        {SPREADS.map((s, i) => (
          <figure
            key={s[0]!.number}
            data-index={i}
            className={cn(
              'flex shrink-0 snap-center bg-white shadow-[0_24px_50px_-28px_rgba(0,0,0,0.6)]',
              s.length === 2 ? 'w-[min(92vw,68rem)]' : 'w-[min(46vw,34rem)] max-sm:w-[78vw]',
              // A single page sits on the side it is printed on.
              s.length === 1 && i > 0 && 'mr-auto',
            )}
            aria-label={`Страницы ${s.map((p) => p.number).join(' и ')}: ${[...new Set(s.map((p) => p.rubric))].join(', ')}`}
          >
            {s.map((page, k) => (
              <div key={page.number} className="relative w-full">
                <Image
                  src={page.src}
                  alt=""
                  width={SAMPLE_PAGE_SIZE.width}
                  height={SAMPLE_PAGE_SIZE.height}
                  sizes={s.length === 2 ? '(min-width: 1100px) 544px, 46vw' : '(min-width: 1100px) 544px, 78vw'}
                  loading={i < 2 ? 'eager' : 'lazy'}
                  className="block h-auto w-full"
                />
                {/* The fold between facing pages. */}
                {s.length === 2 && (
                  <span
                    aria-hidden
                    className={cn(
                      'pointer-events-none absolute inset-y-0 w-10',
                      k === 0 ? 'right-0 bg-gradient-to-l from-black/20 to-transparent' : 'left-0 bg-gradient-to-r from-black/20 to-transparent',
                    )}
                  />
                )}
              </div>
            ))}
          </figure>
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-[68rem] items-center justify-between gap-4 px-4">
        <p className="min-w-0 text-sm" aria-live="polite">
          <span className="font-display text-2xl font-black text-glossy-fuchsia italic">{pages}</span>
          <span className="ml-3 align-[3px] text-muted">{caption}</span>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label="Предыдущий разворот"
            className="grid size-11 place-items-center border-2 border-black text-xl transition-colors hover:bg-black hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-black"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={index === SPREADS.length - 1}
            aria-label="Следующий разворот"
            className="grid size-11 place-items-center border-2 border-black text-xl transition-colors hover:bg-black hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-black"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
