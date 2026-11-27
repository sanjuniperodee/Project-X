'use client';

import { useId, useState } from 'react';

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** Shrinks the name as it gets longer so it always fits the cover width. */
function nameSize(name: string) {
  const n = Math.max(name.length, 4);
  return `min(${(100 / n) * 1.55}cqw, 26cqw)`;
}

/**
 * The hero's memorable moment: a magazine cover that re-sets itself
 * around whatever name the visitor types.
 */
export function LiveCover() {
  const [name, setName] = useState('Айгерим');
  const inputId = useId();
  const shown = name.trim() || 'Ваше имя';
  const now = new Date();

  return (
    <div className="flex flex-col gap-5">
      <figure
        aria-label={`Пример обложки журнала с именем ${shown}`}
        className="relative aspect-[3/4] w-full overflow-hidden bg-glossy-fuchsia text-white [container-type:inline-size]"
      >
        <CoverPortrait />

        <div className="absolute inset-x-0 top-0 px-[5cqw] pt-[3cqw]">
          <p className="font-display text-[16.5cqw] leading-[0.85] font-black tracking-[-0.04em] whitespace-nowrap">COVER ME</p>
          <div className="mt-[1.5cqw] flex justify-between text-[2.6cqw] font-medium">
            <span>№ 01, {MONTHS[now.getMonth()]} {now.getFullYear()}</span>
            <span>Специальный выпуск</span>
          </div>
        </div>

        <ul className="absolute top-[34cqw] left-[5cqw] flex w-[29cqw] flex-col gap-[3.2cqw] text-[3.3cqw] leading-[1.15] font-semibold">
          <li>
            <span className="block font-display text-[6cqw] leading-none font-black italic">Правила жизни</span>
            и почему их нельзя нарушать
          </li>
          <li>Большое интервью: детство, мечты и самое смешное</li>
          <li className="bg-black px-[1.6cqw] py-[1cqw] text-white">Друзья рассказали всё</li>
        </ul>

        <div className="absolute inset-x-0 bottom-0 px-[5cqw] pb-[4cqw]">
          <p
            className="font-display leading-[0.85] font-black tracking-[-0.03em] break-words italic"
            style={{ fontSize: nameSize(shown) }}
          >
            {shown}
          </p>
          <div className="mt-[2cqw] flex items-end justify-between">
            <p className="text-[2.8cqw] font-medium">36 страниц о тебе</p>
            <Barcode />
          </div>
        </div>
      </figure>

      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          Чьё имя поставим на обложку?
        </label>
        <input
          id={inputId}
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          className="h-12 w-full border-0 border-b-2 border-black bg-transparent px-0 font-display text-2xl italic outline-none focus-visible:border-glossy-fuchsia focus-visible:outline-none"
          autoComplete="off"
        />
      </div>
    </div>
  );
}

/** Pop-art duotone portrait drawn in SVG: no stock photography needed. */
export function CoverPortrait() {
  return (
    <svg viewBox="0 0 300 400" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <pattern id="cover-halftone" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <circle cx="3" cy="3" r="1.7" fill="#000" />
        </pattern>
      </defs>
      {/* shoulders */}
      <path d="M78 400c6-58 44-92 96-100h40c52 8 90 42 96 100Z" fill="url(#cover-halftone)" />
      <path d="M78 400c6-58 44-92 96-100M310 400c-6-58-44-92-96-100" fill="none" stroke="#000" strokeWidth="2.5" />
      {/* hair, back */}
      <path d="M194 104c58 0 92 44 92 106 0 56-16 92-24 118H126c-8-26-24-62-24-118 0-62 34-106 92-106Z" fill="#000" />
      {/* neck */}
      <path d="M172 268h44v40c-14 8-30 8-44 0Z" fill="#f9c9dd" stroke="#000" strokeWidth="2.5" />
      {/* face */}
      <ellipse cx="194" cy="214" rx="52" ry="66" fill="#f9c9dd" stroke="#000" strokeWidth="2.5" />
      <path d="M194 148c40 0 58 26 58 54-22-6-46-26-58-48-12 22-36 42-58 48 0-28 18-54 58-54Z" fill="#000" />
      {/* closed eyes, brows, lips */}
      <g fill="none" stroke="#000" strokeWidth="2.6" strokeLinecap="round">
        <path d="M166 214q9 7 18 0M204 214q9 7 18 0" />
        <path d="M164 200q10-6 20-2M204 198q10-4 20 2" />
      </g>
      <path d="M180 246q14-8 28 0q-14 12-28 0Z" fill="#e4007c" stroke="#000" strokeWidth="2" />
      {/* cheek shading */}
      <ellipse cx="236" cy="226" rx="12" ry="22" fill="url(#cover-halftone)" opacity="0.55" />
    </svg>
  );
}

function Barcode() {
  const bars = [3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1];
  let x = 0;
  return (
    <svg viewBox="0 0 64 30" className="h-[7cqw] w-auto bg-white p-[0.6cqw]" aria-hidden>
      {bars.map((w, i) => {
        const rect = i % 2 === 0 ? <rect key={i} x={x} y="0" width={w} height="30" fill="#000" /> : null;
        x += w + 0.8;
        return rect;
      })}
    </svg>
  );
}
