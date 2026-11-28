import 'server-only';
import {
  AdminProjectPage,
  AdminProjectView,
  AdminStats,
  CustomerPage,
  PaymentList,
  CatalogStatus,
  CatalogSyncResult,
  ConversationList,
  ConversationView,
  SellerTrialResponse,
  WhatsAppQr,
  WhatsAppStatus,
  KaspiCashierStatus,
  KaspiCodeResponse,
  InviteView,
  PaymentView,
  Product,
  ProductSummary,
  ProjectView,
  z,
  type AddNoteRequest,
  type AdminProjectQuery,
  type ChangeStatusRequest,
  type ProductId,
} from '@px/contracts';
import { env } from '../config/env';
import { request, type ApiRequestInit } from './core';

const url = (path: string) => `${env.API_URL}/api${path}`;

const adminHeaders = (): Record<string, string> => {
  if (!env.ADMIN_TOKEN) throw new Error('ADMIN_TOKEN is not configured');
  return { authorization: `Bearer ${env.ADMIN_TOKEN}` };
};

/** Query string from defined values only. */
function toSearch(values: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') search.set(key, String(value));
  return search.toString();
}

const call = <S extends z.ZodType>(path: string, schema: S, init?: ApiRequestInit) => request(url(path), schema, init);

/** Server-side gateway client. Every response is validated against the shared contracts. */
export const api = {
  products: () => call('/catalog/products', z.object({ items: z.array(ProductSummary) })).then((r) => r.items),
  product: (id: ProductId) => call(`/catalog/products/${id}`, Product),
  project: (editKey: string) => call(`/projects/${encodeURIComponent(editKey)}`, ProjectView),
  invite: (inviteKey: string) => call(`/invites/${encodeURIComponent(inviteKey)}`, InviteView),
  payment: (paymentId: string) => call(`/payments/${encodeURIComponent(paymentId)}`, PaymentView),

  admin: {
    projects: (query: Partial<AdminProjectQuery>) =>
      call(`/admin/projects?${toSearch({ ...query, status: query.status?.join(',') })}`, AdminProjectPage, { headers: adminHeaders() }),
    stats: () => call('/admin/stats', AdminStats, { headers: adminHeaders() }),
    customers: (query: { q?: string; limit?: number; offset?: number }) => call(`/admin/customers?${toSearch(query)}`, CustomerPage, { headers: adminHeaders() }),
    payments: (projectId: string) =>
      call(`/admin/payments?${toSearch({ projectId })}`, PaymentList, { headers: adminHeaders() }).then((r) => r.items),
    addNote: (id: string, body: AddNoteRequest) =>
      call(`/admin/projects/${encodeURIComponent(id)}/notes`, AdminProjectView, { method: 'POST', body, headers: adminHeaders() }),
    project: (id: string) => call(`/admin/projects/${encodeURIComponent(id)}`, AdminProjectView, { headers: adminHeaders() }),
    changeStatus: (id: string, body: ChangeStatusRequest) =>
      call(`/admin/projects/${encodeURIComponent(id)}/status`, AdminProjectView, {
        method: 'POST',
        body,
        headers: adminHeaders(),
      }),
    whatsapp: {
      status: () => call('/admin/whatsapp', WhatsAppStatus, { headers: adminHeaders() }),
      qr: () => call('/admin/whatsapp/qr', WhatsAppQr, { method: 'POST', body: {}, headers: adminHeaders() }),
      logout: () => call('/admin/whatsapp/logout', WhatsAppStatus, { method: 'POST', body: {}, headers: adminHeaders() }),
    },
    conversations: {
      list: () => call('/admin/conversations', ConversationList, { headers: adminHeaders() }).then((r) => r.items),
      get: (id: string) => call(`/admin/conversations/${encodeURIComponent(id)}`, ConversationView, { headers: adminHeaders() }),
      reply: (id: string, text: string) =>
        call(`/admin/conversations/${encodeURIComponent(id)}/reply`, ConversationView, { method: 'POST', body: { text }, headers: adminHeaders() }),
      mode: (id: string, mode: 'bot' | 'human') =>
        call(`/admin/conversations/${encodeURIComponent(id)}/mode`, ConversationView, { method: 'POST', body: { mode }, headers: adminHeaders() }),
    },
    catalog: {
      status: () => call('/admin/catalog', CatalogStatus, { headers: adminHeaders() }),
      setPhotos: (productId: string, images: string[]) =>
        call(`/admin/catalog/photos/${encodeURIComponent(productId)}`, CatalogStatus, { method: 'PUT', body: { images }, headers: adminHeaders() }),
      sync: () =>
        call('/admin/catalog/sync', CatalogSyncResult, { method: 'POST', body: {}, headers: adminHeaders(), signal: AbortSignal.timeout(300_000) }),
    },
    sellerTrial: (messages: { author: 'customer' | 'bot'; text: string }[]) =>
      call('/admin/sales/trial', SellerTrialResponse, { method: 'POST', body: { messages }, headers: adminHeaders(), signal: AbortSignal.timeout(120_000) }),
    kaspi: {
      status: () => call('/admin/payments/kaspi', KaspiCashierStatus, { headers: adminHeaders() }),
      requestCode: (phone: string) =>
        call('/admin/payments/kaspi/code', KaspiCodeResponse, { method: 'POST', body: { phone }, headers: adminHeaders() }),
      verify: (processId: string, otp: string) =>
        call('/admin/payments/kaspi/verify', KaspiCashierStatus, { method: 'POST', body: { processId, otp }, headers: adminHeaders() }),
      disconnect: () => call('/admin/payments/kaspi/disconnect', KaspiCashierStatus, { method: 'POST', body: {}, headers: adminHeaders() }),
    },
  },
};
