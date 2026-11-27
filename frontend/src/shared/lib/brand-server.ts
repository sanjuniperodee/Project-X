import 'server-only';
import { headers } from 'next/headers';
import type { ProductId } from '@px/contracts';
import { brandBasePath, HOST_BRAND_HEADER, joinPath } from './brand-routing';

/** Server-side link builder for the current request's brand. */
export async function getBrandLinks(brand: ProductId) {
  const h = await headers();
  const base = brandBasePath(brand, h.get(HOST_BRAND_HEADER));
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return {
    base,
    href: (path: string) => joinPath(base, path),
    absolute: (path: string) => `${proto}://${host}${joinPath(base, path)}`,
  };
}
