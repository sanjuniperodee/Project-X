import type { GatewayConfig } from './config';

export interface Route {
  /** Public prefix under the gateway. */
  prefix: string;
  /** Upstream base URL. */
  upstream: string;
  /** Path prefix on the upstream that replaces `prefix`. */
  rewritePrefix: string;
  /** Requires the studio admin token. */
  admin?: boolean;
}

/**
 * The public API surface. Anything not listed here (e.g. `/internal/*`
 * endpoints used between services) is unreachable from the internet.
 */
export function routeTable(config: GatewayConfig): Route[] {
  return [
    { prefix: '/api/catalog', upstream: config.CATALOG_URL, rewritePrefix: '' },
    { prefix: '/api/projects', upstream: config.PROJECTS_URL, rewritePrefix: '/projects' },
    { prefix: '/api/invites', upstream: config.PROJECTS_URL, rewritePrefix: '/invites' },
    { prefix: '/api/admin/projects', upstream: config.PROJECTS_URL, rewritePrefix: '/admin/projects', admin: true },
    { prefix: '/api/admin/stats', upstream: config.PROJECTS_URL, rewritePrefix: '/admin/stats', admin: true },
    { prefix: '/api/admin/customers', upstream: config.PROJECTS_URL, rewritePrefix: '/admin/customers', admin: true },
    { prefix: '/api/admin/payments', upstream: config.PAYMENTS_URL, rewritePrefix: '/admin/payments', admin: true },
    { prefix: '/api/admin/whatsapp', upstream: config.SALES_URL, rewritePrefix: '/admin/whatsapp', admin: true },
    { prefix: '/api/admin/conversations', upstream: config.SALES_URL, rewritePrefix: '/admin/conversations', admin: true },
    { prefix: '/api/admin/catalog', upstream: config.SALES_URL, rewritePrefix: '/admin/catalog', admin: true },
    { prefix: '/api/admin/sales', upstream: config.SALES_URL, rewritePrefix: '/admin/sales', admin: true },
    { prefix: '/api/payments', upstream: config.PAYMENTS_URL, rewritePrefix: '/payments' },
    { prefix: '/api/webhooks/payments', upstream: config.PAYMENTS_URL, rewritePrefix: '/webhooks' },
    { prefix: '/api/media', upstream: config.MEDIA_URL, rewritePrefix: '' },
    { prefix: '/api/voice', upstream: config.VOICE_URL, rewritePrefix: '/voice' },
  ];
}
