import path from 'node:path';
import type { NextConfig } from 'next';

const repoRoot = path.resolve(import.meta.dirname, '..');

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // Shared contracts are TypeScript source living outside this folder.
  transpilePackages: ['@px/contracts', '@px/portrait'],
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  // The try-on's model and runtime (scripts/portrait-assets.mjs): versioned names, cached for good.
  async headers() {
    const immutable = [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }];
    return [
      { source: '/models/:file*', headers: immutable },
      { source: '/vendor/:file*', headers: immutable },
    ];
  },
};

export default nextConfig;
