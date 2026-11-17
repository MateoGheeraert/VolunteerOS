import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image.
  output: 'standalone',
  // pnpm workspace: trace dependencies from the repository root.
  outputFileTracingRoot: path.join(import.meta.dirname, '..'),
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // forbidden() → app/forbidden.tsx when Nest answers 403.
    authInterrupts: true,
  },
  async redirects() {
    return [{ source: '/', destination: '/events', permanent: false }];
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default withNextIntl(nextConfig);
