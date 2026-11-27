import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { MAX_UPLOAD_BYTES, z, type UploadResponse } from '@px/contracts';
import { AppError, parseInput, type FastifyInstance } from '@px/service-kit';
import { extensionFor, sniffImageType, typeForExtension } from '../sniff';
import type { Storage } from '../storage/storage';

const FileParams = z.object({ file: z.string().regex(/^[A-Za-z0-9_-]+\.[a-z0-9]+$/) });

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
    const type = typeForExtension(file.split('.')[1] ?? '');
    const object = type ? await storage.get(file) : null;
    if (!type || !object) throw AppError.notFound('Файл');

    return reply
      .header('content-type', type)
      .header('content-length', object.size)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .send(object.stream);
  });
}
