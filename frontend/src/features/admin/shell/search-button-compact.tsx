'use client';

import { Icons } from '../ui/icons';
import { OPEN_PALETTE } from './command-palette';

/** Search on narrow screens: an icon next to the project switcher. */
export function SearchButtonCompact() {
  return (
    <button
      type="button"
      aria-label="Поиск"
      onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE))}
      className="grid size-11 place-items-center rounded-[10px] border border-line bg-surface text-muted hover:text-ink"
    >
      <Icons.search />
    </button>
  );
}
