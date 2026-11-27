import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { S3Storage } from '../src/storage/s3';

describe('S3Storage', () => {
  const calls: { method: string; url: string; headers: Record<string, string>; body?: Buffer }[] = [];
  const objects = new Map<string, Buffer>();
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = init?.headers as Record<string, string>;
    calls.push({ method: init!.method!, url: url.toString(), headers, body: init?.body as Buffer | undefined });
    if (init!.method === 'PUT') {
      objects.set(url.pathname, init!.body as Buffer);
      return new Response(null, { status: 200 });
    }
    const data = objects.get(url.pathname);
    return data ? new Response(new Uint8Array(data), { headers: { 'content-length': String(data.length) } }) : new Response('<Code>NoSuchKey</Code>', { status: 404 });
  };
  const storage = new S3Storage({
    endpoint: 'https://object.example.test',
    region: 'us-east-1',
    bucket: 'shared-bucket',
    prefix: 'px/',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'secret',
    fetchImpl: fakeFetch,
  });

  it('stores objects under the project prefix with a SigV4 signature', async () => {
    const size = await storage.put('abc123.jpg', Readable.from([Buffer.from('hello '), Buffer.from('world')]));
    expect(size).toBe(11);
    const put = calls.at(-1)!;
    expect(put.url).toBe('https://object.example.test/shared-bucket/px/uploads/abc123.jpg');
    expect(put.headers['content-length']).toBe('11');
    expect(put.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=content-length;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  });

  it('streams objects back and returns null for missing ones', async () => {
    const object = await storage.get('abc123.jpg');
    expect(object?.size).toBe(11);
    const chunks: Buffer[] = [];
    for await (const c of object!.stream) chunks.push(Buffer.from(c));
    expect(Buffer.concat(chunks).toString()).toBe('hello world');
    expect(await storage.get('missing.jpg')).toBeNull();
  });

  it('refuses unsafe keys', async () => {
    await expect(storage.get('../etc.passwd')).rejects.toThrow(/Unsafe/);
  });
});

describe('S3Storage large files', () => {
  it('streams files of known size with an unsigned payload', async () => {
    const seen: { headers: Record<string, string>; streamed: boolean }[] = [];
    const storage = new S3Storage({
      endpoint: 'https://object.example.test',
      region: 'us-east-1',
      bucket: 'b',
      prefix: 'px/',
      accessKeyId: 'AK',
      secretAccessKey: 's',
      fetchImpl: async (_input, init) => {
        seen.push({ headers: init!.headers as Record<string, string>, streamed: !Buffer.isBuffer(init!.body) });
        return new Response(null, { status: 200 });
      },
    });
    expect(await storage.put('layout_x.pdf', Readable.from([Buffer.from('%PDF-')]), { size: 5 })).toBe(5);
    expect(seen[0]).toMatchObject({ streamed: true, headers: { 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'content-length': '5' } });
  });
});
