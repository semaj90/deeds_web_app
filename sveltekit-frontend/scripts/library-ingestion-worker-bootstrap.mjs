import { register } from 'node:module';
import { loadRuntimeEnv } from '../src/lib/server/config/load-runtime-env.js';

// Standalone workers need the same environment-file loading as the Vite server,
// plus the server-only portion of SvelteKit's virtual environment module.
loadRuntimeEnv();
register('./library-ingestion-worker-app-environment-loader.mjs', import.meta.url);

if (process.env.ATLAS_LIBRARY_INGESTION_FIXTURE_PROVIDERS === '1') {
	const databaseUrl = process.env.DATABASE_URL;
	if (process.env.ATLAS_LIBRARY_SEAWEED_SCRATCH_TEST !== '1' || !databaseUrl) {
		throw new Error('LIBRARY_WORKER_FIXTURE_PROVIDERS_REQUIRE_EXPLICIT_SCRATCH_DATABASE');
	}
	const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
	if (databaseName !== 'legal_ai_live_integration_scratch') {
		throw new Error('LIBRARY_WORKER_FIXTURE_PROVIDERS_REFUSE_NON_SCRATCH_DATABASE');
	}
	register('./library-ingestion-worker-scratch-provider-loader.mjs', import.meta.url);
}

await import('./library-ingestion-worker.mts');
