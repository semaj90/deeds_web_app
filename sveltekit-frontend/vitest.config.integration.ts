// vitest.config.integration.ts
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  test: {
    name: 'Integration Tests',
    include: ['src/**/*.integration.test.{js,ts}', 'src/**/integration/*.test.{js,ts}'],
    exclude: ['node_modules/**', 'dist/**', 'src/**/*.unit.test.{js,ts}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/lib/services/__tests__/integration-setup.ts'],
    testTimeout: 30000, // Longer timeout for network requests
    hookTimeout: 10000,
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/api/**', 'src/lib/services/**'],
      exclude: ['src/**/*.test.{js,ts}', 'src/**/__tests__/**', 'src/**/types.ts'],
      thresholds: {
        branches: 60, // Lower for integration tests
        functions: 60,
        lines: 60,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      $lib: new URL('./src/lib', import.meta.url).pathname,
      $app: new URL('./src/app', import.meta.url).pathname,
    },
  },
});
