import { z } from 'zod';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const UploadResponse = z.object({
  id: z.string(),
  /** Public path relative to the API gateway, e.g. "/api/media/files/<id>.jpg". */
  url: z.string(),
  contentType: z.string(),
  size: z.number().int().positive(),
});
export type UploadResponse = z.infer<typeof UploadResponse>;
