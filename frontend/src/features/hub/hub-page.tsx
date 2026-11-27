import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatTenge, type ProductId, type ProductSummary } from '@px/contracts';
import { getBrand } from '@/brands';
import { CoverPortrait } from '@/brands/glossy/live-cover';
import { GrowingTree } from '@/brands/shezhire/growing-tree';
import { SITE } from '@/shared/config/site';
import { Container } from '@/shared/ui/container';
import { cn } from '@/shared/lib/cn';
import { brandHomeUrl } from './brand-url';

const PANEL: Record<ProductId, { className: string; link: string; art: () => ReactNode; font: string }> = {
  glossy: { className: 'bg-white text-black', link: 'border-black', art: CoverArt, font: 'font-[family-name:var(--font-playfair)] font-black' },
  shezhire: { className: 'bg-shezhire-indigo text-shezhire-paper', link: 'border-shezhire-gold text-shezhire-gold', art: TreeArt, font: 'font-[family-name:var(--font-cormorant)] font-semibold' },
  boardgame: { className: 'bg-game-yellow text-black', link: 'border-black', art: CardsArt, font: 'font-[family-name:var(--font-unbounded)] font-black' },
};

export function HubPage({ products }: { products: ProductSummary[] }) {
  return (
    <main>
      <Container wide className="flex h-20 items-center">
        <span className="text-lg font-semibold tracking-tight">{SITE.name}</span>
      </Container>
      <Container wide className="pt-6 pb-12 lg:pt-12 lg:pb-16">
        <h1 className="max-w-[20ch] text-[clamp(2.2rem,4.6vw,4rem)] leading-[1.05] font-semibold tracking-[-0.025em]">
          Подарки, в которых главный герой — ваш человек
        </h1>
        <p className="mt-5 max-w-[56ch] text-lg leading-relaxed text-muted">
          Мы делаем вещи, которые нельзя купить в магазине: журнал о человеке, книгу рода и настольную игру про вашу
          компанию. Материалы собираете вы и ваши близкие, вёрстку и печать берём на себя.
        </p>
      </Container>
      <Container wide className="grid gap-4 pb-16 lg:grid-cols-3">
        {products.map((product) => {
          const brand = getBrand(product.id);
          const panel = PANEL[product.id];
          const Art = panel.art;
          return (
            <Link
              key={product.id}
              href={brandHomeUrl(product.id)}
              className={cn('group flex min-h-[520px] flex-col overflow-hidden rounded-card p-6 sm:p-8', panel.className)}
            >
              <p className={cn('text-3xl leading-none', panel.font)}>{brand.name}</p>
              <div className="flex flex-1 items-center justify-center py-8">
                <Art />
              </div>
              <p className="max-w-[34ch] text-lg leading-snug">{product.tagline}</p>
              <div className="mt-6 flex items-end justify-between gap-4">
                <p className="opacity-75">
                  {formatTenge(product.priceFrom)} – {formatTenge(product.priceTo)}
                </p>
                <span className={cn('border-b-2 pb-0.5 font-medium transition-[padding] group-hover:pb-1.5', panel.link)}>
                  Открыть
                </span>
              </div>
            </Link>
          );
        })}
      </Container>
      <Container wide className="border-t border-line py-8 text-sm text-muted">
        {SITE.name}, {SITE.city}. WhatsApp {SITE.whatsapp}
      </Container>
    </main>
  );
}

function CoverArt() {
  return (
    <div aria-hidden className="relative aspect-[3/4] w-44 bg-glossy-fuchsia p-3 text-white shadow-[12px_12px_0_#000] [container-type:inline-size]">
      <p className="relative font-[family-name:var(--font-playfair)] text-[16.5cqw] leading-[0.85] font-black tracking-[-0.04em] whitespace-nowrap">
        COVER ME
      </p>
      <p className="absolute bottom-3 left-3 z-10 font-[family-name:var(--font-playfair)] text-[16cqw] leading-none font-black italic">
        Айгерим
      </p>
      <CoverPortrait />
    </div>
  );
}

function TreeArt() {
  return (
    <div className="w-full max-w-xs">
      <GrowingTree />
    </div>
  );
}

function CardsArt() {
  const cards = [
    ['bg-game-tomato text-white', '-rotate-12 -translate-x-10'],
    ['bg-game-cobalt text-white', 'rotate-3'],
    ['bg-white text-black', 'rotate-[14deg] translate-x-10'],
  ];
  return (
    <div aria-hidden className="relative h-52 w-36">
      {cards.map(([color, transform], i) => (
        <div
          key={i}
          className={cn('absolute inset-0 rounded-2xl border-[3px] border-black p-3 shadow-[5px_5px_0_#000]', color, transform)}
        >
          <p className="font-[family-name:var(--font-unbounded)] text-[13px] leading-tight font-bold">
            {i === 2 ? 'Кто из нас первым уйдёт с вечеринки?' : ''}
          </p>
        </div>
      ))}
    </div>
  );
}
