import 'server-only';
import type { ProductId } from '@px/contracts';
import { parseBrandDomains } from '@/shared/lib/brand-routing';

/** Link from the hub to a brand: its own domain when configured, the path otherwise. */
export function brandHomeUrl(id: ProductId): string {
  for (const [host, brand] of parseBrandDomains(process.env.BRAND_DOMAINS)) {
    if (brand === id && !host.startsWith('www.')) return `https://${host}`;
  }
  return `/${id}`;
}
