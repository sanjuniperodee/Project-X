'use client';

import Image from 'next/image';
import { useId, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { SAMPLE_PAGE_SIZE, stylePage } from './sample-issue';
import { GLOSSY_STYLES, type GlossyStyleId } from './styles';

const PAGE_NAMES = { tastes: 'Вкусы героя', numbers: 'В цифрах', rules: 'Правила жизни' } as const;

/**
 * The same issue in four styles: a tab per style with its real cover and three inner pages,
 * typeset by the layout service from one questionnaire.
 */
export function StyleShowcase() {
  const [active, setActive] = useState<GlossyStyleId>('vogue');
  const baseId = useId();
  const style = GLOSSY_STYLES.find((s) => s.id === active)!;

  return (
    <div className="flex flex-col gap-10">
      <div role="tablist" aria-label="Стили номера" className="flex flex-wrap gap-2">
        {GLOSSY_STYLES.map((s) => (
          <button
            key={s.id}
            id={`${baseId}-tab-${s.id}`}
            role="tab"
            type="button"
            aria-selected={active === s.id}
            aria-controls={`${baseId}-panel`}
            onClick={() => setActive(s.id)}
            onKeyDown={(e) => {
              const i = GLOSSY_STYLES.findIndex((x) => x.id === active);
              if (e.key === 'ArrowRight') setActive(GLOSSY_STYLES[(i + 1) % GLOSSY_STYLES.length]!.id);
              if (e.key === 'ArrowLeft') setActive(GLOSSY_STYLES[(i + GLOSSY_STYLES.length - 1) % GLOSSY_STYLES.length]!.id);
            }}
            className={cn(
              'flex h-12 items-center gap-2.5 border-2 border-black px-5 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glossy-fuchsia',
              active === s.id ? 'bg-black text-white' : 'bg-white hover:bg-glossy-smoke',
            )}
          >
            <span aria-hidden className="size-3.5 rounded-full ring-1 ring-black/20" style={{ background: s.swatch }} />
            {s.name}
          </button>
        ))}
      </div>

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${active}`} className="grid gap-8 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-4">
          <Image
            key={`${active}-cover`}
            src={stylePage(active, 'cover')}
            alt={`Обложка номера в стиле «${style.name}»`}
            width={SAMPLE_PAGE_SIZE.width}
            height={SAMPLE_PAGE_SIZE.height}
            sizes="(min-width: 1024px) 400px, 90vw"
            className="h-auto w-full shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)] motion-safe:animate-[fade-in_300ms_ease-out]"
          />
        </div>
        <div className="flex flex-col gap-8 lg:col-span-8">
          <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:gap-8">
            <h3 className="font-display text-4xl leading-none font-black">{style.name}</h3>
            <div>
              <p className="max-w-[52ch] text-lg leading-relaxed">{style.look}</p>
              <p className="mt-2 text-sm text-muted">{style.forWhom}</p>
            </div>
          </div>
          <ul className="grid grid-cols-3 gap-3 sm:gap-5">
            {(Object.keys(PAGE_NAMES) as Array<keyof typeof PAGE_NAMES>).map((page) => (
              <li key={page}>
                <Image
                  key={`${active}-${page}`}
                  src={stylePage(active, page)}
                  alt={`Страница «${PAGE_NAMES[page]}» в стиле «${style.name}»`}
                  width={700}
                  height={990}
                  sizes="(min-width: 1024px) 240px, 30vw"
                  className="h-auto w-full shadow-[0_16px_30px_-18px_rgba(0,0,0,0.55)] motion-safe:animate-[fade-in_300ms_ease-out]"
                />
                <p className="mt-2 text-xs text-muted sm:text-sm">{PAGE_NAMES[page]}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
