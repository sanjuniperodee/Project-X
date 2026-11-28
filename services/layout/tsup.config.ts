import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'tsup';
import { FONT_FILES } from './src/infrastructure/fonts';

const require = createRequire(import.meta.url);

// Produces self-contained ESM bundles (the service and its portrait worker thread). Data files read
// at runtime travel next to them: the brand fonts (dist/fonts), the Unicode tables fontkit loads
// relative to the bundle, the MODNet weights (dist/models) and the onnxruntime WebAssembly (dist/ort).
export default defineConfig({
  entry: { main: 'src/main.ts', 'portrait-worker': 'src/infrastructure/portrait-worker.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  bundle: true,
  noExternal: [/.*/],
  sourcemap: true,
  clean: true,
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  onSuccess: async () => {
    mkdirSync('dist/fonts', { recursive: true });
    for (const spec of Object.values(FONT_FILES)) {
      const source = require.resolve(`@expo-google-fonts/${spec.package}/${spec.file}`);
      copyFileSync(source, path.join('dist/fonts', path.basename(spec.file)));
    }
    copyFileSync(require.resolve('@expo-google-fonts/playfair-display/LICENSE_FONT'), 'dist/fonts/OFL.txt');
    copyFileSync(require.resolve('unicode-properties/data.trie'), 'dist/data.trie');
    // `npm run build` fetches the weights first (prebuild); a build without them lays covers out flat.
    const model = path.resolve('../../shared/portrait/models/modnet.onnx');
    if (existsSync(model)) {
      mkdirSync('dist/models', { recursive: true });
      copyFileSync(model, 'dist/models/modnet.onnx');
    } else console.warn('Portrait model missing: run `npm run fetch-model` in shared/portrait');
    mkdirSync('dist/ort', { recursive: true });
    const ort = path.dirname(path.dirname(require.resolve('onnxruntime-web')));
    for (const file of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) copyFileSync(path.join(ort, 'dist', file), path.join('dist/ort', file));
  },
});
