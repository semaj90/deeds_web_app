import { loadRuntimeEnv } from './lib/server/config/load-runtime-env.js';

// Vitest never loads .env itself, and src/lib/server/env.server.ts explicitly
// documents that it does not either — every standalone entrypoint (TRACE MCP,
// graphify launcher, worker launcher, validation scripts) is required to call
// loadRuntimeEnv() before importing env.server.ts. Tests are one more such
// entrypoint: without this, any module that reads a required env var at
// import time (e.g. src/lib/server/llm/runtime-contract.ts's
// ROTORQUANT_MODEL_PATH check) throws during test collection even though the
// real value is already set in .env, failing every test that transitively
// imports it regardless of whether the test itself exercises LLM behavior.
loadRuntimeEnv();

// The opt-in library SeaweedFS integration may write durable fixture rows and
// objects. Force its process onto the named scratch database before any test
// imports can initialize env.server.ts or the shared PostgreSQL pool.
if (process.env.ATLAS_LIBRARY_SEAWEED_SCRATCH_TEST === '1') {
	const scratchDatabaseUrl = new URL(process.env.DATABASE_URL ?? '');
	scratchDatabaseUrl.pathname = '/legal_ai_live_integration_scratch';
	process.env.DATABASE_URL = scratchDatabaseUrl.toString();
}

import '@testing-library/jest-dom/vitest';
