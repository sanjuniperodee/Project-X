// Downloads the pinned MODNet weights into shared/portrait/models (skipped when already there).
//   node scripts/fetch-model.mjs [fp32|fp16 …]   (default: both)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODELS = {
  fp32: { file: 'modnet.onnx', url: 'https://huggingface.co/Xenova/modnet/resolve/fa2fa546052fba4c08921230a26cc69a333fca12/onnx/model.onnx', sha256: '07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9' },
  fp16: { file: 'modnet-fp16.onnx', url: 'https://huggingface.co/Xenova/modnet/resolve/fa2fa546052fba4c08921230a26cc69a333fca12/onnx/model_fp16.onnx', sha256: '25f165da9bfd30830a575f1f0490f1acd995975cb349bc02f3d79332e1fe5cf6' },
};
// Keep in sync with src/model.ts (a test checks it).

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'models');
mkdirSync(dir, { recursive: true });
const sha = (data) => createHash('sha256').update(data).digest('hex');

for (const variant of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(MODELS)) {
  const model = MODELS[variant];
  if (!model) throw new Error(`Unknown model variant: ${variant}`);
  const file = path.join(dir, model.file);
  if (existsSync(file) && sha(readFileSync(file)) === model.sha256) continue;
  process.stdout.write(`Downloading ${model.file}… `);
  const response = await fetch(model.url);
  if (!response.ok) throw new Error(`${model.url}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (sha(data) !== model.sha256) throw new Error(`${model.file}: checksum mismatch`);
  writeFileSync(`${file}.part`, data);
  renameSync(`${file}.part`, file);
  console.log(`${(data.length / 1e6).toFixed(1)} MB`);
}
