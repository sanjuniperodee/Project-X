import { ProductId } from '@px/contracts';

/**
 * Multi-brand routing, in one place.
 *
 * Each product lives under `/[brand]/…`. In production a product also has its
 * own domain (coverme.kz): the proxy rewrites `coverme.kz/x` → `/glossy/x` and
 * tells pages via a request header that the brand prefix must be omitted from links.
 */

/** Set by the proxy when the request came to a brand's own domain. */
export const HOST_BRAND_HEADER = 'x-px-host-brand';

/** Routes shared by all brands; never prefixed or rewritten. */
export const GLOBAL_PREFIXES = ['/api', '/pay', '/admin', '/_next'] as const;

/** "coverme.kz=glossy,shezhire.kz=shezhire" → Map(host → brand). Invalid entries are ignored. */
export function parseBrandDomains(raw: string | undefined): Map<string, ProductId> {
  const map = new Map<string, ProductId>();
  for (const pair of (raw ?? '').split(',')) {
    const [host, brand] = pair.split('=').map((s) => s.trim().toLowerCase());
    const id = ProductId.safeParse(brand);
    if (host && id.success) {
      map.set(host, id.data);
      map.set(`www.${host}`, id.data);
    }
  }
  return map;
}

/** Path prefix for links inside a brand: '' on its own domain, '/glossy' elsewhere. */
export function brandBasePath(brand: ProductId, hostBrand: string | null): string {
  return hostBrand === brand ? '' : `/${brand}`;
}

export function joinPath(base: string, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (clean === '/') return base || '/';
  return `${base}${clean}`;
}
