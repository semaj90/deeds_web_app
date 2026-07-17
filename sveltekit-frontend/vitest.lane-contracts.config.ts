/**
 * Isolated Node-only vitest config for lane-contract unit tests.
 * No browser globals, no SvelteKit transforms, no network.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/lane-contracts/**/*.spec.ts', 'tests/hyperrag/**/*.spec.ts'],
    exclude: ['node_modules/**'],
    globals: false,
    isolate: true,
    testTimeout: 10_000,
  },
});
