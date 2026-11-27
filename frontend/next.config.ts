import path from 'node:path';
import type { NextConfig } from 'next';

const repoRoot = path.resolve(import.meta.dirname, '..');

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // Shared contracts are TypeScript source living outside this folder.
  transpilePackages: ['@px/contracts'],
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
};

export default nextConfig;
