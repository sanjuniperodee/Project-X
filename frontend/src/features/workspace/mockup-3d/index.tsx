'use client';

import type { LayoutPage, ProductId } from '@px/contracts';
import { BookMockup } from './book';
import { GameBoxMockup } from './game-box';

/**
 * The printed product in 3D, made of the same page previews as the layout: Cover Me — a saddle-stitched magazine,
 * Шежіре — a hardcover book, MyGame — the game box. Loaded on demand (`next/dynamic` in layout-pages.tsx).
 */
export function Mockup3D({ pages, productId }: { pages: LayoutPage[]; productId: ProductId }) {
  if (!pages.length) return <p className="text-muted">Страниц пока нет.</p>;
  if (productId === 'boardgame') return <GameBoxMockup pages={pages} />;
  return <BookMockup pages={pages} binding={productId === 'shezhire' ? 'hardcover' : 'saddle'} />;
}
