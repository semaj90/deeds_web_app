/**
 * Live-integration lane: specs that need real PostgreSQL / RabbitMQ / WSL + Neo4j and therefore cannot
 * run in vitest.lane-contracts.config.ts (those three are excluded there on purpose).
 *
 * Run (after reading tests/live-integration/require-opt-in.ts):
 *   ATLAS_LIVE_INTEGRATION_ALLOW_DB_WRITES=1 npm run test:lane:live-integration
 *
 * Serial by design: one file at a time, so a stalled subprocess or broker confirm cannot be blamed on
 * suite contention. Timeouts are longer than the unit lane but still bounded.
 */
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
	resolve: {
		alias: {
			'$lib': resolve(__dirname, 'src/lib'),
			'$app/environment': resolve(__dirname, 'tests/__mocks__/app-environment.ts'),
			'$env/dynamic/private': resolve(__dirname, 'tests/__mocks__/env-dynamic-private.ts'),
			'$lib/server/db/client.js': resolve(__dirname, 'src/lib/server/db/client.ts'),
		},
	},
	test: {
		environment: 'node',
		// The lane never uses the normal DATABASE_URL: only the scratch URL is mapped in (guarded in globalSetup).
		env: { DATABASE_URL: process.env.ATLAS_LIVE_INTEGRATION_DATABASE_URL ?? '' },
		globalSetup: ['tests/live-integration/require-opt-in.ts'],
		setupFiles: ['src/test-runtime-env-setup.ts'],
		include: [
			'src/lib/server/queue/task-outbox-confirm-channel-live.spec.ts',
			'src/lib/server/queue/code-evidence-outbox.spec.ts',
			'src/lib/server/atlas/graph/pagerank-parity.spec.ts',
		],
		fileParallelism: false,
		globals: false,
		isolate: true,
		testTimeout: 120_000,
		hookTimeout: 60_000,
	},
});
