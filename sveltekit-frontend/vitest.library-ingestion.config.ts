import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
	resolve: {
		alias: { '$lib': resolve(__dirname, 'src/lib') },
	},
	test: {
		environment: 'node',
		include: [
			'src/lib/server/features/legal-corpus/legal/library-ingestion-queue-v1.spec.ts',
			'src/lib/server/features/legal-corpus/legal/library-ingestion-identity-v1.spec.ts',
		],
		pool: 'threads',
		maxWorkers: 1,
		minWorkers: 1,
	},
});
