import { createHash, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import type { PutOptions, Storage, StoredObject } from './storage';

export interface S3Options {
  /** e.g. https://object.pscloud.io (path-style addressing). */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Key prefix inside a bucket shared with other projects, e.g. "px/". */
  prefix: string;
  fetchImpl?: typeof fetch;
}

const SAFE_KEY = /^[A-Za-z0-9_-]+\.[a-z0-9]+$/;
const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();
/** SigV4 encoding: everything but unreserved characters; "/" in object paths is kept. */
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = (s: string) => s.split('/').map(enc).join('/');

/**
 * S3-compatible object storage (PS Cloud Object Storage, AWS, MinIO) with a minimal SigV4 signer:
 * the service needs three operations, an SDK would be most of the bundle.
 */
export class S3Storage implements Storage {
  private readonly base: URL;
  private readonly fetch: typeof fetch;
  private pingedAt = 0;

  constructor(private readonly options: S3Options) {
    this.base = new URL(options.endpoint);
    this.fetch = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  async put(key: string, data: Readable, options: PutOptions = {}): Promise<number> {
    if (options.size !== undefined) {
      // Generated layouts can be hundreds of MB: stream them, signing the headers only (UNSIGNED-PAYLOAD; TLS protects the body).
      const res = await this.request('PUT', this.objectPath(key), data, { 'content-length': String(options.size) }, {}, 'UNSIGNED-PAYLOAD');
      if (!res.ok) await this.fail(res, `put ${key}`);
      return options.size;
    }
    // Photo uploads are capped (MAX_UPLOAD_BYTES) and their length is unknown up front: buffer the file.
    const chunks: Buffer[] = [];
    for await (const chunk of data) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    const body = Buffer.concat(chunks);
    const res = await this.request('PUT', this.objectPath(key), body, { 'content-length': String(body.length) });
    if (!res.ok) await this.fail(res, `put ${key}`);
    return body.length;
  }

  async get(key: string): Promise<StoredObject | null> {
    const res = await this.request('GET', this.objectPath(key));
    if (res.status === 404 || res.status === 403) {
      await res.body?.cancel();
      return null;
    }
    if (!res.ok || !res.body) await this.fail(res, `get ${key}`);
    return { size: Number(res.headers.get('content-length') ?? 0), stream: Readable.fromWeb(res.body as never) };
  }

  /** Readiness: one cheap bucket request per minute at most. */
  async ping(): Promise<void> {
    if (Date.now() - this.pingedAt < 60_000) return;
    const res = await this.request('GET', `/${enc(this.options.bucket)}`, undefined, {}, { 'list-type': '2', 'max-keys': '1', prefix: this.options.prefix });
    await res.body?.cancel();
    if (!res.ok) throw new Error(`S3 bucket ${this.options.bucket}: ${res.status}`);
    this.pingedAt = Date.now();
  }

  private objectPath(key: string) {
    if (!SAFE_KEY.test(key)) throw new Error(`Unsafe storage key: ${key}`);
    return `/${enc(this.options.bucket)}/${encPath(`${this.options.prefix}uploads/${key}`)}`;
  }

  private async request(
    method: string,
    pathname: string,
    body?: Buffer | Readable,
    extra: Record<string, string> = {},
    query: Record<string, string> = {},
    unsignedPayload?: 'UNSIGNED-PAYLOAD',
  ) {
    const { accessKeyId, secretAccessKey, region } = this.options;
    const payloadHash = unsignedPayload ?? sha256(Buffer.isBuffer(body) ? body : '');
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const day = amzDate.slice(0, 8);
    const headers: Record<string, string> = { host: this.base.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, ...extra };
    const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim()]));
    const qs = Object.keys(query)
      .sort()
      .map((k) => `${enc(k)}=${enc(query[k]!)}`)
      .join('&');
    const canonical = [method, pathname, qs, names.map((h) => `${h}:${lower[h]}\n`).join(''), names.join(';'), payloadHash].join('\n');
    const scope = `${day}/${region}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), 's3'), 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
    delete headers.host;
    const streaming = body !== undefined && !Buffer.isBuffer(body);
    return this.fetch(`${this.base.origin}${pathname}${qs ? `?${qs}` : ''}`, {
      method,
      headers,
      body: body as RequestInit['body'],
      ...(streaming ? { duplex: 'half' } : {}),
      signal: AbortSignal.timeout(streaming ? 15 * 60_000 : 30_000),
    } as RequestInit);
  }

  private async fail(res: Response, what: string): Promise<never> {
    const text = await res.text().catch(() => '');
    const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1] ?? res.statusText;
    throw new Error(`S3 ${what}: ${res.status} ${code}`);
  }
}
