'use client';

import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { PRODUCT_IDS, ProjectStatus } from '@px/contracts';
import { getBrand } from '@/brands';
import { STATUS_LABEL } from '../lib/status';

/** Status presets for the filter: single statuses plus the groups the team actually works with. */
const STATUS_OPTIONS: Array<[string, string]> = [
  ['', 'Все статусы'],
  ['draft,deposit_paid,in_design,awaiting_approval,paid,printing,shipped', 'В работе'],
  ...ProjectStatus.options.map((s): [string, string] => [s, STATUS_LABEL[s]]),
];

const SORTS: Array<[string, string]> = [
  ['updated', 'Недавно обновлённые'],
  ['created', 'Новые сначала'],
  ['deadline', 'Ближайший праздник'],
  ['total', 'Сумма заказа'],
];

/**
 * Filter bar of the order list. A plain GET form (works without JavaScript); with JavaScript
 * selects apply at once and the search applies on Enter.
 */
export function OrderFilters({ values, view }: { values: Record<string, string>; view: 'table' | 'board' }) {
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const apply = () => {
    const data = new FormData(form.current!);
    const search = new URLSearchParams();
    for (const [key, value] of data) if (typeof value === 'string' && value) search.set(key, value);
    router.push(`/admin/orders${search.size ? `?${search}` : ''}`);
  };
  const select = 'h-8 rounded-control border border-line bg-surface px-2 text-[13px]';
  return (
    <form
      ref={form}
      action="/admin/orders"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        type="search"
        name="q"
        defaultValue={values.q}
        placeholder="Герой, имя или телефон"
        aria-label="Поиск"
        className="h-8 w-64 rounded-control border border-line bg-surface px-2.5 text-[13px] placeholder:text-muted"
      />
      <select name="status" defaultValue={values.status ?? ''} onChange={apply} aria-label="Статус" className={select}>
        {STATUS_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select name="productId" defaultValue={values.productId ?? ''} onChange={apply} aria-label="Продукт" className={select}>
        <option value="">Все продукты</option>
        {PRODUCT_IDS.map((id) => (
          <option key={id} value={id}>
            {getBrand(id).name}
          </option>
        ))}
      </select>
      <select name="design" defaultValue={values.design ?? ''} onChange={apply} aria-label="Вёрстка" className={select}>
        <option value="">Любая вёрстка</option>
        <option value="auto">Автоматическая</option>
        <option value="studio">Вручную</option>
      </select>
      <select name="sort" defaultValue={values.sort ?? 'updated'} onChange={apply} aria-label="Сортировка" className={select}>
        {SORTS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {values.phone && <input type="hidden" name="phone" value={values.phone} />}
      <input type="hidden" name="view" value={view === 'board' ? 'board' : ''} />
      {Object.keys(values).some((k) => k !== 'sort' && k !== 'offset') && (
        <a href={view === 'board' ? '/admin/orders?view=board' : '/admin/orders'} className="text-[13px] text-muted hover:text-ink">
          Сбросить
        </a>
      )}
    </form>
  );
}
