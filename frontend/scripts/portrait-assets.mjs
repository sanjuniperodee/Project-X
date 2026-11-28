// Puts the try-on's matting model and the onnxruntime WebAssembly into public/ (generated, not committed).
// File names carry the model hash and the runtime version, so they are cached forever (next.config.ts).
//   node scripts/portrait-assets.mjs        (runs before `next dev` and `next build`)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portrait = path.resolve(root, '../shared/portrait');
const require = createRequire(import.meta.url);

execFileSync(process.execPath, [path.join(portrait, 'scripts/fetch-model.mjs'), 'fp16'], { stdio: 'inherit' });
const model = path.join(portrait, 'models/modnet-fp16.onnx');
const hash = createHash('sha256').update(readFileSync(model)).digest('hex').slice(0, 8);

const models = path.join(root, 'public/models');
mkdirSync(models, { recursive: true });
for (const file of readdirSync(models)) if (file !== `modnet-fp16-${hash}.onnx`) rmSync(path.join(models, file));
const target = path.join(models, `modnet-fp16-${hash}.onnx`);
if (!existsSync(target)) copyFileSync(model, target);

const ortDist = path.dirname(require.resolve('onnxruntime-web'));
const { version } = JSON.parse(readFileSync(path.join(ortDist, '../package.json'), 'utf8'));
const vendor = path.join(root, 'public/vendor');
mkdirSync(vendor, { recursive: true });
for (const dir of readdirSync(vendor)) if (dir.startsWith('ort-') && dir !== `ort-${version}`) rmSync(path.join(vendor, dir), { recursive: true });
mkdirSync(path.join(vendor, `ort-${version}`), { recursive: true });
// The runtime and its loader (some browsers import the loader instead of the bundled one).
for (const file of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  copyFileSync(path.join(ortDist, file), path.join(vendor, `ort-${version}`, file));
}
