'use client';

import { formatTenge } from '@px/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/shared/lib/cn';

export interface DailySeries {
  id: string;
  name: string;
  color: string;
  /** Per day, aligned with `dates`. */
  revenue: number[];
  orders: number[];
}

type Metric = 'revenue' | 'orders';

const HEIGHT = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 52 };
const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayLong = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'UTC' });

/** Clean ticks: 0 and three round steps covering the maximum. */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 3;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw)!;
  return [0, step, step * 2, step * 3];
}

const compact = (n: number, metric: Metric) =>
  metric === 'orders' ? String(n) : n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)} млн` : n >= 1000 ? `${Math.round(n / 1000)} тыс` : String(n);

/**
 * The last 30 days as columns: paid money or new orders by the day the order came in, stacked by
 * project in the overview of all projects. Hover or focus a day for its numbers.
 */
export function DailyChart({ dates, series }: { dates: string[]; series: DailySeries[] }) {
  const [metric, setMetric] = useState<Metric>('revenue');
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  useEffect(() => {
    const el = box.current!;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const totals = useMemo(() => dates.map((_, i) => series.reduce((sum, s) => sum + s[metric][i]!, 0)), [dates, series, metric]);
  const scale = ticks(Math.max(...totals));
  const top = scale.at(-1)!;
  const plotW = Math.max(100, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / dates.length;
  const barW = Math.min(24, Math.max(4, slot - 6));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const sum = totals.reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[22px] font-semibold tracking-[-0.01em]">{metric === 'revenue' ? formatTenge(sum) : `${sum} заказов`}</p>
          <p className="text-[12px] text-muted">{metric === 'revenue' ? 'оплачено по заказам за 30 дней' : 'новых заказов за 30 дней'}</p>
        </div>
        <div role="tablist" aria-label="Показатель" className="flex rounded-[8px] bg-zinc-100 p-0.5 text-[13px]">
          {(['revenue', 'orders'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={metric === m}
              onClick={() => setMetric(m)}
              className={cn('h-7 rounded-[6px] px-3 transition-colors', metric === m ? 'bg-white font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-muted hover:text-ink')}
            >
              {m === 'revenue' ? 'Оплачено' : 'Заказы'}
            </button>
          ))}
        </div>
      </div>

      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-zinc-600" aria-label="Проекты">
          {series.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}

      <div ref={box} className="relative" onPointerLeave={() => setHover(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label={`${metric === 'revenue' ? 'Оплачено' : 'Новые заказы'} по дням за последние 30 дней`} className="block">
          {scale.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="#e4e4e7" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="#71717a">
                {compact(t, metric)}
              </text>
            </g>
          ))}
          {dates.map((date, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            let base = 0;
            const stack = series.map((s) => {
              const v = s[metric][i]!;
              const from = base;
              base += v;
              return { s, v, from, to: base };
            }).filter((part) => part.v > 0);
            return (
              <g key={date} opacity={hover === null || hover === i ? 1 : 0.45}>
                {stack.map((part, k) => {
                  const last = k === stack.length - 1;
                  const y0 = y(part.from);
                  // 2px surface gap between stacked parts.
                  const y1 = y(part.to) + (last ? 0 : 1);
                  const h = Math.max(1, y0 - y1 - (k > 0 ? 1 : 0));
                  const top = y0 - h - (k > 0 ? 1 : 0);
                  const r = last ? Math.min(4, h, barW / 2) : 0;
                  const x = cx - barW / 2;
                  return (
                    <path
                      key={part.s.id}
                      fill={part.s.color}
                      d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`}
                    />
                  );
                })}
                {(i % 7 === dates.length % 7 || i === dates.length - 1) && (
                  <text
                    x={i === dates.length - 1 ? PAD.left + slot * (i + 1) : cx}
                    y={HEIGHT - 8}
                    textAnchor={i === dates.length - 1 ? 'end' : 'middle'}
                    fontSize={11}
                    fill="#71717a"
                  >
                    {day.format(new Date(`${date}T00:00:00Z`))}
                  </text>
                )}
                <rect
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${dayLong.format(new Date(`${date}T00:00:00Z`))}: ${metric === 'revenue' ? formatTenge(totals[i]!) : `${totals[i]} заказов`}`}
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-48 rounded-[10px] border border-line bg-surface p-3 text-[12px] shadow-[0_8px_24px_-6px_rgba(24,24,27,0.2)]"
            style={{ left: Math.min(width - 196, Math.max(0, PAD.left + slot * hover + slot / 2 - 96)) }}
          >
            <p className="text-muted">{dayLong.format(new Date(`${dates[hover]}T00:00:00Z`))}</p>
            <p className="mt-0.5 text-[15px] font-semibold">{metric === 'revenue' ? formatTenge(totals[hover]!) : `${totals[hover]} заказов`}</p>
            {series.length > 1 && (
              <ul className="mt-2 flex flex-col gap-1">
                {series.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-zinc-600">
                      <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                      {s.name}
                    </span>
                    <span className="font-medium">{metric === 'revenue' ? formatTenge(s.revenue[hover]!) : s.orders[hover]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>По дням за 30 дней</caption>
        <thead>
          <tr>
            <th>День</th>
            {series.map((s) => (
              <th key={s.id}>{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date, i) => (
            <tr key={date}>
              <td>{date}</td>
              {series.map((s) => (
                <td key={s.id}>{metric === 'revenue' ? formatTenge(s.revenue[i]!) : s.orders[i]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
