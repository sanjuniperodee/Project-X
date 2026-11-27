import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { MAX_UPLOAD_BYTES, z, type UploadResponse } from '@px/contracts';
import { AppError, parseInput, type FastifyInstance } from '@px/service-kit';
import { extensionFor, sniffImageType, typeForExtension } from '../sniff';
import type { Storage } from '../storage/storage';

const FileParams = z.object({ file: z.string().regex(/^[A-Za-z0-9_-]+\.[a-z0-9]+$/) });

/**
 * Files other services generate (layout PDFs, page previews, thumbnails). Stored only through the
 * internal route below, never uploaded by browsers: SVG in particular must never come from users.
 */
const GENERATED: Record<string, { type: string; matches: (head: Buffer) => boolean }> = {
  pdf: { type: 'application/pdf', matches: (head) => head.subarray(0, 5).toString('latin1') === '%PDF-' },
  svg: { type: 'image/svg+xml', matches: (head) => head.subarray(0, 5).toString('utf8') === '<svg ' },
  jpg: { type: 'image/jpeg', matches: (head) => sniffImageType(head) === 'image/jpeg' },
};
const MAX_GENERATED_BYTES = 1024 * 1024 * 1024;

function contentTypeOf(file: string): string | null {
  const ext = file.split('.')[1] ?? '';
  return typeForExtension(ext) ?? (ext === 'pdf' || ext === 'svg' ? GENERATED[ext]!.type : null);
}

export function registerRoutes(app: FastifyInstance, storage: Storage, publicPath: string) {
  app.post('/uploads', async (request, reply) => {
    const file = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
    if (!file) throw AppError.badRequest('Прикрепите файл в поле file');

    // Read the first chunk to detect the real type, then stream the rest to storage.
    const iterator = file.file[Symbol.asyncIterator]();
    const first = await iterator.next();
    const head: Buffer = first.done ? Buffer.alloc(0) : (first.value as Buffer);
    const type = sniffImageType(head);
    if (!type) {
      file.file.resume();
      throw AppError.validation({ file: 'Поддерживаются фото в форматах JPEG, PNG, WebP и HEIC' });
    }

    const id = randomUUID().replaceAll('-', '');
    const key = `${id}.${extensionFor(type)}`;
    const body = Readable.from(
      (async function* () {
        yield head;
        for (let next = await iterator.next(); !next.done; next = await iterator.next()) yield next.value as Buffer;
      })(),
    );
    const size = await storage.put(key, body);
    if (file.file.truncated) {
      throw AppError.validation({ file: `Файл больше ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ` });
    }

    const response: UploadResponse = { id, url: `${publicPath}/files/${key}`, contentType: type, size };
    return reply.status(201).send(response);
  });

  app.get('/files/:file', async (request, reply) => {
    const { file } = parseInput(FileParams, request.params);
    const type = contentTypeOf(file);
    const object = type ? await storage.get(file) : null;
    if (!type || !object) throw AppError.notFound('Файл');

    if (type === 'image/svg+xml') {
      // Previews are our own markup, but an SVG is a document: no scripts, no external loads, ever.
      reply.header('content-security-policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox");
    }
    if (type === 'application/pdf') reply.header('content-disposition', `inline; filename="${file}"`);
    return reply
      .header('content-type', type)
      .header('content-length', object.size)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .send(object.stream);
  });
}

/** Service-to-service storage of generated files. The gateway blocks every `/internal/*` path. */
export function registerInternalRoutes(app: FastifyInstance, storage: Storage, publicPath: string) {
  app.register(async (internal) => {
    // Bodies are streamed to storage as they arrive, whatever their size.
    internal.addContentTypeParser('*', (_request, payload, done) => done(null, payload));

    internal.put('/internal/files/:file', { bodyLimit: MAX_GENERATED_BYTES }, async (request, reply) => {
      const { file } = parseInput(FileParams, request.params);
      const spec = GENERATED[file.split('.')[1] ?? ''];
      if (!spec) throw AppError.validation({ file: 'Сохраняются только PDF, SVG и JPEG' });
      const size = Number(request.headers['content-length']);
      if (!Number.isInteger(size) || size <= 0 || size > MAX_GENERATED_BYTES) {
        throw AppError.validation({ file: 'Нужен заголовок content-length, не больше 1 ГБ' });
      }

      const iterator = (request.body as Readable)[Symbol.asyncIterator]();
      const first = await iterator.next();
      const head: Buffer = first.done ? Buffer.alloc(0) : Buffer.from(first.value as Uint8Array);
      if (!spec.matches(head)) throw AppError.validation({ file: `Содержимое не похоже на ${spec.type}` });

      let received = head.length;
      const body = Readable.from(
        (async function* () {
          yield head;
          for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
            const chunk = Buffer.from(next.value as Uint8Array);
            received += chunk.length;
            yield chunk;
          }
        })(),
      );
      await storage.put(file, body, { size });
      if (received !== size) throw AppError.validation({ file: `Получено ${received} байт из ${size}` });

      const response: UploadResponse = { id: file.split('.')[0]!, url: `${publicPath}/files/${file}`, contentType: spec.type, size };
      return reply.status(201).send(response);
    });
  });
}
