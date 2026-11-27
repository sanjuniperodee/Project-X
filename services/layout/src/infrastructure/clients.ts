import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { LayoutSource, Product, UploadResponse, type ProductId } from '@px/contracts';
import { AppError, ServiceClient } from '@px/service-kit';
import type { CatalogGateway, MediaGateway, ProjectsGateway } from '../application/ports';

export class HttpProjectsGateway implements ProjectsGateway {
  private readonly client: ServiceClient;

  constructor(baseUrl: string) {
    this.client = new ServiceClient('projects', baseUrl);
  }

  layoutSource(projectId: string): Promise<LayoutSource> {
    return this.client.request(`/internal/projects/${encodeURIComponent(projectId)}/layout-source`, LayoutSource);
  }
}

export class HttpCatalogGateway implements CatalogGateway {
  private readonly client: ServiceClient;

  constructor(baseUrl: string) {
    this.client = new ServiceClient('catalog', baseUrl);
  }

  product(id: ProductId): Promise<Product> {
    return this.client.request(`/products/${id}`, Product);
  }
}

/**
 * Talks to the media service directly (inside the private network): reads photos from
 * `/files/:key` and stores generated files through `PUT /internal/files/:key`, which the
 * gateway never exposes. Large files are streamed both ways.
 */
export class HttpMediaGateway implements MediaGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 120_000,
  ) {}

  async download(key: string, file: string): Promise<boolean> {
    const response = await this.fetch(`/files/${encodeURIComponent(key)}`);
    if (response.status === 404) return false;
    if (!response.ok || !response.body) throw AppError.unavailable(`media ответил ${response.status} на ${key}`);
    const handle = await open(file, 'w');
    try {
      await pipeline(response.body, handle.createWriteStream());
    } finally {
      await handle.close().catch(() => undefined);
    }
    return true;
  }

  async get(key: string): Promise<Buffer | null> {
    const response = await this.fetch(`/files/${encodeURIComponent(key)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw AppError.unavailable(`media ответил ${response.status} на ${key}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async put(key: string, body: Buffer | { file: string }, contentType: string): Promise<string> {
    const size = Buffer.isBuffer(body) ? body.length : (await stat(body.file)).size;
    const response = await this.fetch(`/internal/files/${encodeURIComponent(key)}`, {
      method: 'PUT',
      // Media streams the body straight to storage and needs the size up front.
      headers: { 'content-type': contentType, 'content-length': String(size) },
      body: Buffer.isBuffer(body) ? body : createReadStream(body.file),
      duplex: 'half',
    } as RequestInit);
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) throw AppError.unavailable(`media не сохранил ${key}: ${response.status}`);
    return UploadResponse.parse(payload).url;
  }

  private async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await fetch(new URL(path, this.baseUrl), { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      throw AppError.unavailable(`Сервис media недоступен: ${(error as Error).message}`);
    }
  }
}
