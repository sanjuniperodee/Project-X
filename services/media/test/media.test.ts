import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildMediaApp } from '../src/app';
import { LocalDiskStorage } from '../src/storage/local-disk';

// 1×1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

let dir = '';
let service: Awaited<ReturnType<typeof buildMediaApp>>;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'px-media-'));
  service = await buildMediaApp({ storage: new LocalDiskStorage(dir), publicPath: '/api/media', logLevel: 'warn' });
});

afterAll(async () => {
  await service.app.close();
  await rm(dir, { recursive: true, force: true });
});

function multipart(filename: string, type: string, content: Buffer) {
  const boundary = '----px-test';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

it('stores images by their sniffed type and serves them back', async () => {
  const upload = await service.app.inject({ method: 'POST', url: '/uploads', ...multipart('photo.jpg', 'image/jpeg', PNG) });
  expect(upload.statusCode).toBe(201);
  const body = upload.json();
  expect(body.contentType).toBe('image/png');
  expect(body.url).toMatch(/^\/api\/media\/files\/[a-f0-9]{32}\.png$/);

  const file = await service.app.inject({ method: 'GET', url: body.url.replace('/api/media', '') });
  expect(file.statusCode).toBe(200);
  expect(file.headers['content-type']).toBe('image/png');
  expect(file.rawPayload.equals(PNG)).toBe(true);
});

it('rejects files that are not images whatever their declared type', async () => {
  const res = await service.app.inject({
    method: 'POST',
    url: '/uploads',
    ...multipart('evil.png', 'image/png', Buffer.from('<html><script>alert(1)</script></html>')),
  });
  expect(res.statusCode).toBe(422);
});

it('refuses path traversal', async () => {
  const res = await service.app.inject({ method: 'GET', url: '/files/..%2F..%2Fetc%2Fpasswd' });
  expect(res.statusCode).toBe(422);
});
