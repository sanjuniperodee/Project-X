import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  // public/vendor holds the copied onnxruntime loader (scripts/portrait-assets.mjs).
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'public/vendor/**'] },
];

export default config;
