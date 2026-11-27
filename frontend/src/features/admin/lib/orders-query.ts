import { AdminProjectQuery, type AdminProjectQueryInput } from '@px/contracts';

export type OrdersView = 'table' | 'board';

export interface OrdersSearch {
  query: AdminProjectQuery;
  view: OrdersView;
  /** Raw values for the filter form. */
  raw: Record<string, string>;
}

const KEYS = ['status', 'productId', 'design', 'q', 'phone', 'sort', 'offset'] as const;

/** Reads /admin/orders search params; invalid values fall back to defaults instead of failing the page. */
export function parseOrdersSearch(params: Record<string, string | string[] | undefined>, limit = 50): OrdersSearch {
  const raw: Record<string, string> = {};
  for (const key of KEYS) {
    const value = params[key];
    if (typeof value === 'string' && value.trim()) raw[key] = value.trim();
  }
  const parsed = AdminProjectQuery.safeParse({ ...raw, limit });
  const query = parsed.success ? parsed.data : AdminProjectQuery.parse({ limit });
  return { query, view: params.view === 'board' ? 'board' : 'table', raw };
}

/** Link to the order list with the given filters (empty values are dropped). */
export function ordersHref(filters: Partial<Record<keyof AdminProjectQueryInput | 'view', string | number | undefined>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '' && !(key === 'offset' && Number(value) === 0)) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `/admin/orders?${text}` : '/admin/orders';
}
