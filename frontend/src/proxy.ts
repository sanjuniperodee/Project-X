import { NextResponse, type NextRequest } from 'next/server';
import { PRODUCT_IDS } from '@px/contracts';
import { GLOBAL_PREFIXES, HOST_BRAND_HEADER, parseBrandDomains } from './shared/lib/brand-routing';

const brandDomains = parseBrandDomains(process.env.BRAND_DOMAINS);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return requireBasicAuth(request) ?? NextResponse.next();
  }

  const rawHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const host = rawHost.split(':')[0]!.toLowerCase();
  const hostBrand = brandDomains.get(host);
  if (!hostBrand || GLOBAL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // coverme.kz/glossy/create → coverme.kz/create (keep public URLs clean).
  const prefix = `/${hostBrand}`;
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
    // Build from the public Host header: behind a reverse proxy nextUrl may carry the internal address.
    const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
    const url = new URL(`${pathname.slice(prefix.length) || '/'}${request.nextUrl.search}`, `${proto}://${rawHost}`);
    return NextResponse.redirect(url, 308);
  }

  // Another brand's path on this domain is not served here.
  if (PRODUCT_IDS.some((id) => pathname === `/${id}` || pathname.startsWith(`/${id}/`))) {
    return new NextResponse(null, { status: 404 });
  }

  // coverme.kz/create → /glossy/create, and tell pages to omit the prefix in links.
  const url = request.nextUrl.clone();
  url.pathname = `${prefix}${pathname === '/' ? '' : pathname}`;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(HOST_BRAND_HEADER, hostBrand);
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

function requireBasicAuth(request: NextRequest): NextResponse | null {
  const user = process.env.ADMIN_USER;
  const password = process.env.ADMIN_PASSWORD;
  if (!user || !password) {
    return new NextResponse('Back-office is disabled: set ADMIN_USER and ADMIN_PASSWORD.', { status: 503 });
  }

  const header = request.headers.get('authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [givenUser, ...rest] = atob(encoded).split(':');
    if (safeEqual(givenUser ?? '', user) && safeEqual(rest.join(':'), password)) return null;
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'www-authenticate': 'Basic realm="Studio back-office", charset="UTF-8"' },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  // Skip static assets and files with an extension.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)'],
};
