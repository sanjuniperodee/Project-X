// Prints the silhouette the layout service finds on a photo (same thumbnail, same model):
//   npx tsx scripts/trace.ts photo.jpg > silhouette.json
import { readFile } from 'node:fs/promises';
import { probe, thumbnail } from '../src/infrastructure/images';
import { defaultPortraitModel, OnnxPortraitFinder } from '../src/infrastructure/portraits';

const file = process.argv[2];
if (!file) throw new Error('Usage: tsx scripts/trace.ts <photo.jpg>');
const data = await readFile(file);
const { width, height } = probe(data);
const preview = await thumbnail(data, Number(process.env.THUMB ?? 640));
const finder = new OnnxPortraitFinder(defaultPortraitModel(), console as never);
const silhouette = await finder.silhouette(preview.data);
await finder.release();
console.log(JSON.stringify({ width, height, silhouette }));
