import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, 'src/lib'),
    },
  },
  test: {
    include: ['src/lib/server/retrieval/latent256-*.spec.ts'],
    exclude: ['node_modules/**'],
    isolate: true,
    globals: false,
  },
});
