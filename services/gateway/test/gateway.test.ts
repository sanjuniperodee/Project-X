import { createService } from '@px/service-kit';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildGateway } from '../src/app';

const ADMIN_TOKEN = 'test-admin-token-with-enough-length';
const upstream = createService({ name: 'upstream', logLevel: 'warn' });
let gateway: Awaited<ReturnType<typeof buildGateway>>;

beforeAll(async () => {
  // Echoes the path it received so we can assert on rewrites.
  upstream.app.all('/*', async (request) => ({ path: request.url, requestId: request.headers['x-request-id'] }));
  await upstream.app.listen({ host: '127.0.0.1', port: 0 });
  const address = upstream.app.server.address();
  const url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  gateway = await buildGateway({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: 0,
    LOG_LEVEL: 'warn',
    CATALOG_URL: url,
    PROJECTS_URL: url,
    PAYMENTS_URL: url,
    MEDIA_URL: url, SALES_URL: 'http://sales.test',
    CORS_ORIGINS: 'http://localhost:3000',
    ADMIN_TOKEN,
    TRUST_PROXY: false,
    RATE_LIMIT_PER_MINUTE: 1000,
  });
});

afterAll(async () => {
  await gateway?.app.close();
  await upstream.app.close();
});

it.each([
  ['/api/catalog/products', '/products'],
  ['/api/projects/abc/steps/hero', '/projects/abc/steps/hero'],
  ['/api/invites/xyz', '/invites/xyz'],
  ['/api/payments/p1', '/payments/p1'],
  ['/api/webhooks/payments/kaspi', '/webhooks/kaspi'],
  ['/api/media/files/a.jpg', '/files/a.jpg'],
])('routes %s to upstream %s', async (from, to) => {
  const res = await gateway.app.inject({ method: 'GET', url: from });
  expect(res.statusCode).toBe(200);
  expect(res.json().path).toBe(to);
  expect(res.json().requestId).toBe(res.headers['x-request-id']);
});

it('protects studio endpoints with the admin token', async () => {
  expect((await gateway.app.inject({ method: 'GET', url: '/api/admin/projects' })).statusCode).toBe(401);
  const wrong = await gateway.app.inject({ method: 'GET', url: '/api/admin/projects', headers: { authorization: 'Bearer nope' } });
  expect(wrong.statusCode).toBe(401);
  const ok = await gateway.app.inject({
    method: 'GET',
    url: '/api/admin/projects',
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  expect(ok.json().path).toBe('/admin/projects');
});

it('never exposes internal endpoints', async () => {
  expect((await gateway.app.inject({ method: 'POST', url: '/internal/payments' })).statusCode).toBe(404);
  expect((await gateway.app.inject({ method: 'POST', url: '/api/internal/payments' })).statusCode).toBe(404);
});

it.each(['/api/media/internal/files/x.pdf', '/api/media/%69nternal/files/x.pdf', '/api/projects/../internal/projects/1/layout-source', '/api/media/INTERNAL/files/x.svg'])(
  'never exposes internal endpoints: %s',
  async (url) => {
    const res = await gateway.app.inject({ method: 'PUT', url, payload: '%PDF-' });
    expect(res.statusCode).toBe(404);
  },
);
