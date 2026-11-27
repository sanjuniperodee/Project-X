import type { ALLOWED_IMAGE_TYPES } from '@px/contracts';

type ImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const EXTENSIONS: Record<ImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/**
 * Detects the real image type from the first bytes. The browser-provided
 * MIME type is not trusted: a renamed HTML file must never be served as an image.
 */
export function sniffImageType(head: Buffer): ImageType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (head.toString('ascii', 4, 8) === 'ftyp') {
    const brand = head.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx'].includes(brand)) return 'image/heic';
    if (['mif1', 'msf1', 'heif'].includes(brand)) return 'image/heif';
  }
  return null;
}

export function extensionFor(type: ImageType): string {
  return EXTENSIONS[type];
}

export function typeForExtension(ext: string): ImageType | null {
  const entry = Object.entries(EXTENSIONS).find(([, value]) => value === ext);
  return (entry?.[0] as ImageType | undefined) ?? null;
}
