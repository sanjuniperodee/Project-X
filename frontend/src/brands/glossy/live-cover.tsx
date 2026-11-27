'use client';

import Image from 'next/image';
import { useId, useState } from 'react';
import { cn } from '@/shared/lib/cn';

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const OCCASIONS = ['День рождения', 'Юбилей', 'Свадьба'] as const;

/**
 * Font size that keeps the name inside the cover: one word on one line, longer names
 * over at most two lines broken at spaces. ~0.68em per letter of Playfair Black Italic.
 */
function nameSize(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  const longestWord = Math.max(...words.map((w) => w.length), 1);
  const perLine = words.length > 1 ? Math.max(longestWord, Math.ceil(name.length / 2)) : longestWord;
  return `min(${(86 / (Math.max(perLine, 5) * 0.68)).toFixed(2)}cqw, 21cqw)`;
}

/**
 * The landing's memorable moment: the printed cover, set in the browser the same way the
 * layout service sets it, re-typesetting itself around the name the visitor types.
 */
export function LiveCover() {
  const [name, setName] = useState('Айгерим');
  const [occasion, setOccasion] = useState<(typeof OCCASIONS)[number]>('День рождения');
  const inputId = useId();
  // Short words stick to the next one, as in print: «Айгерим и\u00a0Ерлан».
  const shown = (name.trim() || 'Ваше имя').replace(/(^|\s)([иваскуо])\s+/gi, '$1$2\u00a0');
  const now = new Date();
  const month = MONTHS[now.getMonth()]!;

  return (
    <div className="flex flex-col gap-6">
      <figure
        aria-label={`Пример обложки журнала Cover Me с именем ${shown}`}
        className="relative aspect-[210/297] w-full overflow-hidden bg-black text-white shadow-[0_30px_60px_-30px_rgba(0,0,0,0.55)] [container-type:inline-size]"
      >
        <Image
          src="/coverme/cover-portrait.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 440px, 90vw"
          className="object-cover object-[50%_22%]"
        />
        <div aria-hidden className="absolute inset-x-0 top-0 h-[34%] bg-gradient-to-b from-black/45 to-transparent" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-black/65 via-black/25 to-transparent" />

        <div className="absolute inset-x-0 top-0 px-[4cqw] pt-[3.5cqw]">
          <p className="text-center font-display text-[18.2cqw] leading-[0.86] font-black tracking-[-0.03em] whitespace-nowrap">
            COVER ME
          </p>
          <div className="mt-[2cqw] flex justify-between px-[3cqw] text-[2.2cqw] font-semibold tracking-[0.18em] uppercase">
            <span>
              № 01 · {month} {now.getFullYear()} · {occasion}
            </span>
            <span>Цена: бесценно</span>
          </div>
        </div>

        <ul className="absolute top-[37cqw] left-[7cqw] flex w-[36cqw] flex-col gap-[3.4cqw]">
          <li>
            <span className="mb-[1.6cqw] inline-block bg-glossy-fuchsia px-[1.6cqw] py-[0.6cqw] text-[2cqw] font-bold tracking-[0.16em] uppercase">
              Эксклюзив
            </span>
            <span className="block font-display text-[5.6cqw] leading-[1.02] font-black">Большое интервью</span>
            <span className="mt-[0.8cqw] block text-[2.3cqw] font-semibold">Смелая, смешная, упрямая</span>
            <span aria-hidden className="mt-[1.6cqw] block h-[0.4cqw] w-[5cqw] bg-glossy-fuchsia" />
          </li>
          <li>
            <span className="block font-display text-[4.3cqw] leading-[1.02] font-black">Друзья рассказали всё</span>
            <span className="mt-[0.8cqw] block text-[2.3cqw] font-semibold">Истории из первых уст</span>
            <span aria-hidden className="mt-[1.6cqw] block h-[0.4cqw] w-[5cqw] bg-glossy-fuchsia" />
          </li>
          <li>
            <span className="block font-display text-[4.3cqw] leading-[1.02] font-black">Правила жизни</span>
            <span className="mt-[0.8cqw] block text-[2.3cqw] font-semibold">Принципы, которые работают</span>
          </li>
        </ul>

        <div className="absolute inset-x-0 bottom-0 px-[7cqw] pb-[5cqw]">
          <p
            className="font-display leading-[0.92] font-black tracking-[-0.02em] italic"
            style={{ fontSize: nameSize(shown) }}
          >
            {shown}
          </p>
          <div className="mt-[2.4cqw] flex items-end justify-between gap-[3cqw]">
            <p className="text-[2.4cqw] font-semibold tracking-[0.02em]">Специальный выпуск о человеке, которого мы любим</p>
            <Barcode />
          </div>
        </div>
      </figure>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-sm font-medium">
            Чьё имя поставим на обложку?
          </label>
          <input
            id={inputId}
            value={name}
            maxLength={22}
            onChange={(e) => setName(e.target.value)}
            className="h-12 w-full border-0 border-b-2 border-black bg-transparent px-0 font-display text-2xl italic outline-none focus-visible:border-glossy-fuchsia"
            autoComplete="off"
          />
        </div>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Повод</legend>
          {OCCASIONS.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={occasion === o}
              onClick={() => setOccasion(o)}
              className={cn(
                'h-9 border-2 border-black px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glossy-fuchsia',
                occasion === o ? 'bg-black text-white' : 'bg-white hover:bg-glossy-smoke',
              )}
            >
              {o}
            </button>
          ))}
        </fieldset>
      </div>
    </div>
  );
}

/** Decorative EAN-like barcode, as on the printed cover. */
function Barcode() {
  const bars = [2, 1, 1, 3, 1, 2, 2, 1, 1, 1, 3, 2, 1, 1, 2, 1, 1, 3, 1, 2, 1, 1, 2, 2, 1, 3, 1, 1, 2, 1];
  let x = 0;
  return (
    <svg viewBox="0 0 70 36" className="h-[9cqw] w-auto shrink-0 bg-white px-[1cqw] pt-[1cqw]" aria-hidden>
      {bars.map((w, i) => {
        const rect = i % 2 === 0 ? <rect key={i} x={x} y="0" width={w} height={i < 2 || i > 27 ? 30 : 27} fill="#000" /> : null;
        x += w + 0.7;
        return rect;
      })}
      <text x="35" y="35" textAnchor="middle" fontSize="6" fontFamily="sans-serif" fill="#000">
        4 607 015 280 01
      </text>
    </svg>
  );
}
