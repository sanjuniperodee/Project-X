import { defineConfig } from 'tsup';

// Produces a single self-contained ESM bundle: the runtime image needs only `node dist/main.js`.
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
});
