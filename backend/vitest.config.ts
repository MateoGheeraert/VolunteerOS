import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC instead of esbuild: Nest needs decorator metadata, which esbuild doesn't emit.
const plugins = [swc.vite({ module: { type: 'es6' } })];

export default defineConfig({
  test: {
    projects: [
      {
        plugins,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          environment: 'node',
        },
      },
      {
        plugins,
        test: {
          name: 'integration',
          include: ['test/**/*.int.test.ts'],
          environment: 'node',
          globalSetup: ['test/global-setup.ts'],
          setupFiles: ['test/env.ts'],
          // One shared database: run files one after another.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
