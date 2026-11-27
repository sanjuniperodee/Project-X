import { tmpdir } from 'node:os';
import { z } from '@px/contracts';
import { loadConfig } from '@px/service-kit';

export const config = loadConfig({
  NATS_URL: z.string().startsWith('nats://'),
  PROJECTS_URL: z.url(),
  CATALOG_URL: z.url(),
  /** Media service inside the private network (not the public /api/media path). */
  MEDIA_URL: z.url(),
  /** Scratch space for downloaded photos and the PDF being written; cleaned after every layout. */
  LAYOUT_TMP_DIR: z.string().default(tmpdir()),
  /** Longest side of the preview thumbnails, px. */
  PREVIEW_THUMBNAIL_SIZE: z.coerce.number().int().min(200).max(2000).default(640),
  /** Optional directory with the brand TTF files (the build puts them next to the bundle). */
  FONTS_DIR: z.string().optional(),
});
