import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  plugins: [sveltekit(), svelteTesting()],
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, './src/lib'),
    },
    // Ensure Svelte components render in client mode for tests
    conditions: ['browser'],
  },
  test: {
    include: [
      'src/**/*.{test,spec}.{js,ts}',
      'tests/**/*.{test,spec}.{js,ts}',
      '../scripts/**/*.{test,spec}.{js,ts}',
    ],
    // Use jsdom for browser-like environment
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts', 'tests/setup.ts'],
    globals: true,
    // Increased timeout for async operations and property-based tests
    testTimeout: 30000,
    // Allow tests with server-side code
    server: {
      deps: {
        // Inline testing-library for proper Svelte 5 support
        inline: [/@testing-library\/svelte/],
      },
    },
    // Mock module resolution
    alias: {
      $lib: path.resolve(__dirname, './src/lib'),
    },
    // Coverage settings
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/**', '**/*.d.ts', '**/*.test.ts', '**/*.spec.ts'],
    },
  },
});
