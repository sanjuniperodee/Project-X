'use server';

import type { ProductId, ProjectStatus } from '@px/contracts';
import { api } from '@/shared/api/server';

export interface SearchResults {
  orders: Array<{ id: string; subject: string; productId: ProductId; status: ProjectStatus; customerName: string }>;
  customers: Array<{ phone: string; name: string; orders: number }>;
}

/** Quick search of the command palette: orders and customers of every project. */
export async function searchAdmin(raw: string): Promise<SearchResults> {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return { orders: [], customers: [] };
  const [orders, customers] = await Promise.all([
    api.admin.projects({ q, sort: 'updated', limit: 6 }).catch(() => null),
    api.admin.customers({ q, limit: 4 }).catch(() => null),
  ]);
  return {
    orders: (orders?.items ?? []).map((o) => ({ id: o.id, subject: o.subject, productId: o.productId, status: o.status, customerName: o.customerName })),
    customers: (customers?.items ?? []).map((c) => ({ phone: c.phone, name: c.name, orders: c.orders })),
  };
}
