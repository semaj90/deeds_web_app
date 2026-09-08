// @vitest-environment node
//
// Live (non-mocked) runtime proof for the cold-tier half of the "Hot / warm / cold storage"
// cluster in openspec/changes/parent-atlas-trace-search-joinback-proof/tasks.md's
// "Repository-first search inventory". Proves ColdStorageRetrievalService.search() genuinely
// executes a pgvector cosine query against live Postgres rather than silently swallowing a
// connection error and returning [] (the method's own catch block makes that failure mode
// indistinguishable from "no rows" by return value alone, so this spies on console.error to
// detect it).
//
// Opt-in only via RUN_DB_INTEGRATION=1, matching this repo's existing Postgres-integration
// convention (graphify-daily-coordinator-v1.integration.spec.ts et al.).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const RUN_DB_INTEGRATION = process.env.RUN_DB_INTEGRATION === '1';
const describeIf = RUN_DB_INTEGRATION ? describe : describe.skip;

describeIf('ColdStorageRetrievalService (live Postgres pgvector)', () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		errorSpy.mockRestore();
	});

	it('executes a real pgvector query without swallowing a connection error', async () => {
		const { ColdStorageRetrievalService } = await import('./cold-storage-retrieval-service.js');

		const zeroVector = new Array(768).fill(0);
		const hits = await ColdStorageRetrievalService.search(zeroVector, 5);

		// Only the method's own catch block logs with this prefix; other console.error calls
		// (e.g. the db client's unrelated "[DB] Canonical target" startup log) are not this bug.
		const swallowedErrorCalls = errorSpy.mock.calls.filter((call) =>
			String(call[0]).includes('[ColdStorageRetrievalService]'),
		);
		expect(swallowedErrorCalls).toHaveLength(0);
		expect(Array.isArray(hits)).toBe(true);

		for (const hit of hits) {
			expect(hit).toMatchObject({
				lane: 'cold_storage',
				signals: expect.objectContaining({ topology: 0.5 }),
			});
			expect(typeof hit.score).toBe('number');
		}
	});

	it('is re-exported unchanged through the retrieval/ alias path real callers use', async () => {
		const canonical = await import('./cold-storage-retrieval-service.js');
		const alias = await import('$lib/server/retrieval/cold-storage-retrieval-service.js');
		expect(alias.ColdStorageRetrievalService).toBe(canonical.ColdStorageRetrievalService);
	});
});
