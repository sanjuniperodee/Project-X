import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'tsup';
import { FONT_FILES } from './src/infrastructure/fonts';

const require = createRequire(import.meta.url);

// Produces a single self-contained ESM bundle. Data files read at runtime travel next to it:
// the brand fonts (dist/fonts) and the Unicode tables fontkit loads relative to the bundle.
export default defineConfig({
  entry: ['src/main.ts'],
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
  },
});
