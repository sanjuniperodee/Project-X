import type { NextRequest } from 'next/server';
import { env } from '@/shared/config/env';

/**
 * Same-origin passthrough to the API gateway, resolved at runtime.
 * The browser only ever talks to `/api/*` on the site it is on; bodies
 * (including multipart uploads) are streamed, not buffered.
 * Studio endpoints are never reachable from the browser.
 */
const HOP_BY_HOP = ['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'upgrade', 'authorization', 'cookie'];
const STRIP_FROM_RESPONSE = ['content-encoding', 'content-length', 'transfer-encoding', 'connection'];

async function forward(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path[0] === 'admin') {
    return Response.json({ error: { code: 'not_found', message: 'Не найдено' } }, { status: 404 });
  }

  const target = `${env.API_URL}/api/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP) headers.delete(name);
  headers.set('x-forwarded-host', request.headers.get('host') ?? '');
  // The gateway rate-limits per client IP and trusts X-Forwarded-For: keep the visitor's address chain.
  const forwardedFor = [request.headers.get('x-forwarded-for'), request.headers.get('x-real-ip')]
    .filter(Boolean)
    .join(', ');
  if (forwardedFor) headers.set('x-forwarded-for', forwardedFor);
  // x-request-id (when present) is kept as is, so one id follows the request through every service.

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Required by Node's fetch to stream a request body.
      ...(hasBody ? { duplex: 'half' } : {}),
      redirect: 'manual',
      cache: 'no-store',
    } as RequestInit);
  } catch {
    return Response.json(
      { error: { code: 'unavailable', message: 'Сервер временно недоступен. Попробуйте через минуту.' } },
      { status: 503 },
    );
  }

  const responseHeaders = new Headers(upstream.headers);
  for (const name of STRIP_FROM_RESPONSE) responseHeaders.delete(name);
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
