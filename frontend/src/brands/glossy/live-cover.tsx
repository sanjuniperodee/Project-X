'use client';

import Image from 'next/image';
import { useId, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { GLOSSY_STYLES, type GlossyStyleId } from './styles';

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/**
 * Font size that keeps the name inside the cover: one word on one line, longer names
 * over at most two lines broken at spaces. `perLetter` is the face's average letter width in em.
 */
function nameSize(name: string, perLetter: number, width = 86, max = 21) {
  const words = name.split(/\s+/).filter(Boolean);
  const longestWord = Math.max(...words.map((w) => w.length), 1);
  const perLine = words.length > 1 ? Math.max(longestWord, Math.ceil(name.length / 2)) : longestWord;
  return `min(${(width / (Math.max(perLine, 5) * perLetter)).toFixed(2)}cqw, ${max}cqw)`;
}

const LINES = [
  { title: 'Большое интервью', text: 'Смелая, смешная, упрямая' },
  { title: 'Друзья рассказали всё', text: 'Истории из первых уст' },
  { title: 'Правила жизни', text: 'Принципы, которые работают' },
];

interface CoverProps {
  name: string;
  issueLine: string;
}

/**
 * The landing's memorable moment: the printed cover, set in the browser the same way the
 * layout service sets it, in any of the four styles, around the name the visitor types.
 */
export function LiveCover() {
  const [name, setName] = useState('Айгерим');
  const [style, setStyle] = useState<GlossyStyleId>('vogue');
  const inputId = useId();
  // Short words stick to the next one, as in print: «Айгерим и Ерлан».
  const shown = (name.trim() || 'Ваше имя').replace(/(^|\s)([иваскуо])\s+/gi, '$1$2 ');
  const now = new Date();
  const issueLine = `№ 01 · ${MONTHS[now.getMonth()]} ${now.getFullYear()} · День рождения`;
  const Cover = { vogue: VogueCover, tabloid: TabloidCover, tender: TenderCover, noir: NoirCover }[style];

  return (
    <div className="flex flex-col gap-6">
      <figure
        aria-label={`Пример обложки Cover Me в стиле «${GLOSSY_STYLES.find((s) => s.id === style)!.name}» с именем ${shown}`}
        className="relative aspect-[210/297] w-full overflow-hidden shadow-[0_30px_60px_-30px_rgba(0,0,0,0.55)] [container-type:inline-size]"
      >
        <Cover name={shown} issueLine={issueLine} />
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
          <legend className="mb-2 text-sm font-medium">Стиль номера</legend>
          {GLOSSY_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={style === s.id}
              onClick={() => setStyle(s.id)}
              className={cn(
                'flex h-9 items-center gap-2 border-2 border-black px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glossy-fuchsia',
                style === s.id ? 'bg-black text-white' : 'bg-white hover:bg-glossy-smoke',
              )}
            >
              <span aria-hidden className="size-3 rounded-full ring-1 ring-black/20" style={{ background: s.swatch }} />
              {s.name}
            </button>
          ))}
        </fieldset>
      </div>
    </div>
  );
}

function Portrait({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/coverme/cover-portrait.jpg"
      alt=""
      fill
      priority={priority}
      sizes="(min-width: 1024px) 440px, 90vw"
      className={cn('object-cover object-[50%_22%]', className)}
    />
  );
}

/** Глянец: Didone masthead, cover lines down the left, the name in black italic. The accent comes from the photo. */
function VogueCover({ name, issueLine }: CoverProps) {
  const accent = '#aa0e2d';
  return (
    <div className="absolute inset-0 bg-black text-white">
      <Portrait priority />
      <div aria-hidden className="absolute inset-x-0 top-0 h-[34%] bg-gradient-to-b from-black/45 to-transparent" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-black/65 via-black/25 to-transparent" />
      <div className="absolute inset-x-0 top-0 px-[4cqw] pt-[3.5cqw]">
        <p className="text-center font-display text-[18.2cqw] leading-[0.86] font-black tracking-[-0.03em] whitespace-nowrap">COVER ME</p>
        <div className="mt-[2cqw] flex justify-between px-[3cqw] text-[2.2cqw] font-semibold tracking-[0.18em] uppercase">
          <span>{issueLine}</span>
          <span>Цена: бесценно</span>
        </div>
      </div>
      <ul className="absolute top-[37cqw] left-[7cqw] flex w-[36cqw] flex-col gap-[3.4cqw]">
        {LINES.map((line, i) => (
          <li key={line.title}>
            {i === 0 && (
              <span className="mb-[1.6cqw] inline-block px-[1.6cqw] py-[0.6cqw] text-[2cqw] font-bold tracking-[0.16em] uppercase" style={{ background: accent }}>
                Эксклюзив
              </span>
            )}
            <span className={cn('block font-display leading-[1.02] font-black', i === 0 ? 'text-[5.6cqw]' : 'text-[4.3cqw]')}>{line.title}</span>
            <span className="mt-[0.8cqw] block text-[2.3cqw] font-semibold">{line.text}</span>
            <span aria-hidden className="mt-[1.6cqw] block h-[0.4cqw] w-[5cqw]" style={{ background: accent }} />
          </li>
        ))}
      </ul>
      <div className="absolute inset-x-0 bottom-0 px-[7cqw] pb-[5cqw]">
        <p className="font-display leading-[0.92] font-black tracking-[-0.02em] italic" style={{ fontSize: nameSize(name, 0.68) }}>
          {name}
        </p>
        <div className="mt-[2.4cqw] flex items-end justify-between gap-[3cqw]">
          <p className="text-[2.4cqw] font-semibold">Женщина, которая доходит до озера</p>
          <Barcode className="h-[9cqw]" />
        </div>
      </div>
    </div>
  );
}

/** Таблоид: red masthead band, yellow strip, shouting lines on black bars and a burst. */
function TabloidCover({ name, issueLine }: CoverProps) {
  return (
    <div className="absolute inset-0 bg-black text-white">
      <Portrait />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      <div className="absolute inset-x-0 top-0 bg-[#e10600] px-[4cqw] pt-[3cqw] pb-[2cqw]">
        <p className="text-center font-[family-name:var(--font-dela)] text-[13.4cqw] leading-[0.95] whitespace-nowrap">COVER ME</p>
      </div>
      <div className="absolute inset-x-0 top-[21cqw] flex justify-between bg-[#ffe600] px-[7cqw] py-[1cqw] text-[2.2cqw] font-bold tracking-[0.12em] text-black uppercase">
        <span>{issueLine}</span>
        <span>Цена: бесценно</span>
      </div>
      <ul className="absolute top-[31cqw] left-[7cqw] flex w-[50cqw] flex-col gap-[3cqw]">
        {LINES.map((line, i) => (
          <li key={line.title} className="flex flex-col items-start">
            <span
              className={cn(
                'bg-black px-[1.6cqw] py-[0.6cqw] font-[family-name:var(--font-oswald)] leading-[1.05] font-bold text-[#ffe600] uppercase',
                i === 0 ? 'text-[6cqw]' : 'text-[4.4cqw]',
              )}
            >
              {line.title}
            </span>
            <span className="mt-[1cqw] text-[2.3cqw] font-bold">{line.text}</span>
          </li>
        ))}
      </ul>
      <div
        aria-hidden
        className="absolute top-[30cqw] right-[5cqw] grid size-[24cqw] place-items-center bg-[#ffe600] text-center text-black [clip-path:polygon(50%_0%,61%_12%,76%_6%,79%_21%,94%_24%,88%_39%,100%_50%,88%_61%,94%_76%,79%_79%,76%_94%,61%_88%,50%_100%,39%_88%,24%_94%,21%_79%,6%_76%,12%_61%,0%_50%,12%_39%,6%_24%,21%_21%,24%_6%,39%_12%)]"
      >
        <span className="px-[3cqw] font-[family-name:var(--font-oswald)] text-[3.6cqw] leading-none font-bold text-[#e10600] uppercase">
          Сенсация!
          <span className="mt-[0.8cqw] block font-sans text-[1.8cqw] leading-tight font-bold text-black normal-case">Все тайны</span>
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 px-[7cqw] pb-[5cqw]">
        <p className="font-[family-name:var(--font-dela)] leading-[0.95] uppercase" style={{ fontSize: nameSize(name, 0.9, 82, 17) }}>
          {name}
        </p>
        <div className="mt-[2.4cqw] flex items-end justify-between gap-[3cqw]">
          <p className="bg-[#e10600] px-[1.6cqw] py-[0.8cqw] text-[2.2cqw] font-bold tracking-[0.06em] uppercase">Женщина, которая доходит до озера</p>
          <Barcode className="h-[9cqw]" />
        </div>
      </div>
    </div>
  );
}

/** Нежность: paper, a light italic masthead, the portrait as an inset print, the name below in rose. */
function TenderCover({ name, issueLine }: CoverProps) {
  const rose = '#b56d70';
  return (
    <div className="absolute inset-0 bg-[#fdfaf7] text-[#3b302c]">
      <p className="pt-[3cqw] text-center font-[family-name:var(--font-cormorant)] text-[21cqw] leading-[0.95] font-light italic">cover me</p>
      <div className="mx-[10.5cqw] mt-[0.5cqw] flex justify-between text-[1.9cqw] font-semibold tracking-[0.16em] text-[#8c7d76] uppercase">
        <span>{issueLine}</span>
        <span>Цена: бесценно</span>
      </div>
      <div className="absolute top-[29.5cqw] right-[10.5cqw] bottom-[31cqw] left-[10.5cqw]">
        <div aria-hidden className="absolute -inset-[1.9cqw] border" style={{ borderColor: rose }} />
        <div className="relative size-full overflow-hidden">
          <Portrait />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-black/45 to-transparent" />
          <ul className="absolute bottom-[4cqw] left-[4cqw] flex flex-col gap-[2cqw] text-white">
            {LINES.slice(0, 2).map((line) => (
              <li key={line.title}>
                <span className="block font-[family-name:var(--font-cormorant)] text-[4.6cqw] leading-none font-semibold italic">{line.title}</span>
                <span className="text-[1.9cqw]">{line.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p
        className="absolute inset-x-[6cqw] bottom-[13cqw] text-center font-[family-name:var(--font-cormorant)] leading-none font-semibold italic"
        style={{ fontSize: nameSize(name, 0.5, 88, 14), color: rose }}
      >
        {name}
      </p>
      <p className="absolute inset-x-0 bottom-[5cqw] text-center font-[family-name:var(--font-cormorant)] text-[3cqw] text-[#8c7d76] italic">
        Женщина, которая доходит до озера
      </p>
    </div>
  );
}

/** Нуар: a darker exposure, spaced capitals, credits down the left, a gold name and frame. */
function NoirCover({ name, issueLine }: CoverProps) {
  const gold = '#c9a24a';
  return (
    <div className="absolute inset-0 bg-[#0f0e0d] text-[#eee7dc]">
      <Portrait className="brightness-[0.72]" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-[36%] bg-gradient-to-b from-black/80 to-transparent" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
      <div aria-hidden className="absolute inset-[3.3cqw] border" style={{ borderColor: gold }} />
      <p className="relative pt-[7cqw] text-center font-[family-name:var(--font-cormorant)] text-[11cqw] leading-none font-semibold tracking-[0.24em] whitespace-nowrap">
        COVER ME
      </p>
      <p className="relative mt-[2cqw] text-center text-[1.9cqw] font-semibold tracking-[0.3em] uppercase" style={{ color: gold }}>
        {issueLine}
      </p>
      <ul className="absolute top-[31cqw] left-[7.5cqw] flex w-[40cqw] flex-col gap-[3.5cqw]">
        {LINES.map((line) => (
          <li key={line.title}>
            <span className="block font-[family-name:var(--font-cormorant)] text-[3.4cqw] leading-tight font-semibold tracking-[0.16em] uppercase">
              {line.title}
            </span>
            <span className="mt-[0.5cqw] block font-[family-name:var(--font-cormorant)] text-[2.6cqw] italic" style={{ color: gold }}>
              {line.text}
            </span>
          </li>
        ))}
      </ul>
      <div className="absolute inset-x-0 bottom-0 px-[7.5cqw] pb-[8cqw]">
        <p className="font-[family-name:var(--font-cormorant)] leading-[0.9] font-semibold italic" style={{ fontSize: nameSize(name, 0.5, 85, 22), color: gold }}>
          {name}
        </p>
        <div className="mt-[2.4cqw] flex items-end justify-between gap-[3cqw]">
          <p className="text-[1.9cqw] font-semibold tracking-[0.28em] uppercase">Женщина, которая доходит до озера</p>
          <Barcode className="h-[8cqw]" light />
        </div>
      </div>
    </div>
  );
}

/** Decorative EAN-like barcode, as on the printed cover. */
function Barcode({ className, light }: { className?: string; light?: boolean }) {
  const bars = [2, 1, 1, 3, 1, 2, 2, 1, 1, 1, 3, 2, 1, 1, 2, 1, 1, 3, 1, 2, 1, 1, 2, 2, 1, 3, 1, 1, 2, 1];
  const ink = light ? '#eee7dc' : '#000';
  let x = 0;
  return (
    <svg viewBox="0 0 70 36" className={cn('w-auto shrink-0 px-[1cqw] pt-[1cqw]', light ? 'bg-transparent' : 'bg-white', className)} aria-hidden>
      {bars.map((w, i) => {
        const rect = i % 2 === 0 ? <rect key={i} x={x} y="0" width={w} height={i < 2 || i > 27 ? 30 : 27} fill={ink} /> : null;
        x += w + 0.7;
        return rect;
      })}
      <text x="35" y="35" textAnchor="middle" fontSize="6" fontFamily="sans-serif" fill={ink}>
        4 607 015 280 01
      </text>
    </svg>
  );
}
