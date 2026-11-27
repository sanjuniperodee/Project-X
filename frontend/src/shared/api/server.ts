import 'server-only';
import {
  AdminProjectView,
  InviteView,
  PaymentView,
  Product,
  ProductSummary,
  ProjectList,
  ProjectView,
  z,
  type ChangeStatusRequest,
  type ProductId,
  type ProjectStatus,
} from '@px/contracts';
import { env } from '../config/env';
import { request, type ApiRequestInit } from './core';

const url = (path: string) => `${env.API_URL}/api${path}`;

const adminHeaders = (): Record<string, string> => {
  if (!env.ADMIN_TOKEN) throw new Error('ADMIN_TOKEN is not configured');
  return { authorization: `Bearer ${env.ADMIN_TOKEN}` };
};

const call = <S extends z.ZodType>(path: string, schema: S, init?: ApiRequestInit) => request(url(path), schema, init);

/** Server-side gateway client. Every response is validated against the shared contracts. */
export const api = {
  products: () => call('/catalog/products', z.object({ items: z.array(ProductSummary) })).then((r) => r.items),
  product: (id: ProductId) => call(`/catalog/products/${id}`, Product),
  project: (editKey: string) => call(`/projects/${encodeURIComponent(editKey)}`, ProjectView),
  invite: (inviteKey: string) => call(`/invites/${encodeURIComponent(inviteKey)}`, InviteView),
  payment: (paymentId: string) => call(`/payments/${encodeURIComponent(paymentId)}`, PaymentView),

  admin: {
    projects: (status?: ProjectStatus) =>
      call(`/admin/projects${status ? `?status=${status}` : ''}`, ProjectList, { headers: adminHeaders() }).then(
        (r) => r.items,
      ),
    project: (id: string) => call(`/admin/projects/${encodeURIComponent(id)}`, AdminProjectView, { headers: adminHeaders() }),
    changeStatus: (id: string, body: ChangeStatusRequest) =>
      call(`/admin/projects/${encodeURIComponent(id)}/status`, AdminProjectView, {
        method: 'POST',
        body,
        headers: adminHeaders(),
      }),
  },
};
