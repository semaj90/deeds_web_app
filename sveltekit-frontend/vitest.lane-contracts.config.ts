/**
 * Isolated Node-only vitest config for lane-contract unit tests.
 * No browser globals, no SvelteKit transforms, no network.
 */
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
	resolve: {
		alias: {
			'$lib': resolve(__dirname, 'src/lib'),
			// The isolated lane does not load SvelteKit's normal .js -> .ts
			// server-module resolver. Keep this explicit for the Drizzle client
			// imported by the artifact transport boundary.
			'$lib/server/db/client.js': resolve(__dirname, 'src/lib/server/db/client.ts'),
		},
	},
  test: {
    environment: 'node',
    // These Arrow helpers are repository-owned ESM scripts imported by the
    // SvelteKit readback spec. Inline them so Vitest does not hand the
    // workspace .mjs files to its external CJS loader.
    server: {
      deps: {
        inline: [/write-candidate-feature-arrow\.mjs$/, /read-candidate-feature-arrow\.mjs$/],
      },
    },
    include: [
      'tests/lane-contracts/**/*.spec.ts',
      'tests/hyperrag/**/*.spec.ts',
      'src/lib/server/atlas/**/*.spec.ts',
		'src/lib/server/queue/**/*.spec.ts',
      'src/lib/server/analysis/ast-grep-extractor.lineage.spec.ts',
		'src/lib/server/nlp/nlp-observation-lineage-v1.spec.ts',
		'src/lib/server/embedding/semantic-embedding-cache-key-v2.spec.ts',
		'src/lib/server/graph/**/*.spec.ts',
      'src/lib/server/hyperrag/**/*.spec.ts',
      'src/routes/api/admin/atlas/**/*.spec.ts',
    ],
    exclude: ['node_modules/**'],
    globals: false,
    isolate: true,
    testTimeout: 10_000,
  },
});
