import type { LayoutSource, Product, ProductId } from '@px/contracts';
import type { LayoutDocument, Page } from '../domain/document';

export interface ProjectsGateway {
  /** Frozen materials of a project in design (`GET /internal/projects/:id/layout-source`). */
  layoutSource(projectId: string): Promise<LayoutSource>;
}

export interface CatalogGateway {
  product(id: ProductId): Promise<Product>;
}

export interface MediaGateway {
  /** Downloads a stored file to a local path; false when it does not exist. */
  download(key: string, file: string): Promise<boolean>;
  /** Small files (cached thumbnails); null when missing. */
  get(key: string): Promise<Buffer | null>;
  /** Stores a generated file and returns its public URL. */
  put(key: string, body: Buffer | { file: string }, contentType: 'application/pdf' | 'image/svg+xml' | 'image/jpeg'): Promise<string>;
}

export interface ProbedImage {
  type: 'jpeg' | 'png' | 'webp' | 'heic' | 'unknown';
  width: number;
  height: number;
}

export interface ImageProcessor {
  probe(data: Uint8Array): ProbedImage;
  thumbnail(data: Uint8Array, maxSide: number): Promise<{ data: Buffer }>;
}

export interface Renderer {
  pdf(document: LayoutDocument, file: string, options: { photoPath: (key: string) => string | undefined; author: string }): Promise<void>;
  svg(page: Page, options: { thumbnail: (key: string) => Buffer | undefined }): string;
}
