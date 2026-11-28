'use client';

import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { PRODUCT_IDS } from '@px/contracts';
import { getBrand } from '@/brands';
import { Icons } from '../ui/icons';

const SORTS: Array<[string, string]> = [
  ['updated', 'Недавно обновлённые'],
  ['created', 'Новые сначала'],
  ['deadline', 'Ближайший праздник'],
  ['total', 'Сумма заказа'],
];

/**
 * Search and secondary filters of the order list (the status is in the tabs above).
 * A plain GET form; with JavaScript selects apply at once and the search applies on Enter.
 */
export function OrderFilters({ values, view, showProduct }: { values: Record<string, string>; view: 'table' | 'board'; showProduct: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const apply = () => {
    const data = new FormData(form.current!);
    const search = new URLSearchParams();
    for (const [key, value] of data) if (typeof value === 'string' && value) search.set(key, value);
    router.push(`/admin/orders${search.size ? `?${search}` : ''}`);
  };
  const select = 'h-9 rounded-control border border-line bg-surface pr-7 pl-2.5 text-[13px] hover:border-zinc-300';
  const filtered = ['q', 'productId', 'design', 'phone'].some((k) => values[k]);
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
      <label className="relative">
        <span className="sr-only">Поиск</span>
        <Icons.search className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" width={16} height={16} />
        <input
          type="search"
          name="q"
          defaultValue={values.q}
          placeholder="Герой, имя или телефон"
          className="h-9 w-72 max-w-full rounded-control border border-line bg-surface pr-2.5 pl-8 text-[13px] placeholder:text-muted hover:border-zinc-300 focus-visible:border-zinc-400 focus-visible:outline-none"
        />
      </label>
      {showProduct && (
        <select name="productId" defaultValue={values.productId ?? ''} onChange={apply} aria-label="Проект" className={select}>
          <option value="">Все проекты</option>
          {PRODUCT_IDS.map((id) => (
            <option key={id} value={id}>
              {getBrand(id).name}
            </option>
          ))}
        </select>
      )}
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
      {values.status && <input type="hidden" name="status" value={values.status} />}
      {values.phone && <input type="hidden" name="phone" value={values.phone} />}
      <input type="hidden" name="view" value={view === 'board' ? 'board' : ''} />
      {filtered && (
        <a href={view === 'board' ? '/admin/orders?view=board' : '/admin/orders'} className="px-2 text-[13px] text-muted hover:text-ink">
          Сбросить
        </a>
      )}
    </form>
  );
}
