// @vitest-environment node
/**
 * Phase A4 — durable writers: belt-and-braces env gate + DI surface.
 *
 * Both writers MUST refuse live HTTP under VITEST/NODE_ENV=test unless the
 * caller explicitly passes `allowLiveWritesInTests: true`. This is the
 * structural fix for the test-artifact-leak found after Phase A4 wiring —
 * even if a test forgets to inject a mock `couchWriteFn`/`qdrantBackfillFn`,
 * the default implementations refuse to hit the real backend.
 */

import { describe, expect, it, vi } from 'vitest';

import { writeCardToCouchDB } from '../src/lib/server/agents/regen/writers/couchdb-writer.js';
import { backfillQdrantPayload } from '../src/lib/server/agents/regen/writers/qdrant-backfill.js';
import type { AgentsDirectoryCard } from '../src/lib/server/agents/agents-card-store.js';

function makeCard(dirPath = 'src/lib/x'): AgentsDirectoryCard {
	return {
		id:              `agents:dir:${dirPath.replace(/\//g, '-')}`,
		dirPath,
		title:           'X',
		summary:         '',
		staticImports:   [],
		dynamicImports:  [],
		pathAliases:     [],
		featureKeys:     ['k1', 'k2'],
		routeSurfaces:   [],
		schemaTables:    [],
		qdrantTags:      [],
		auditStatus:     'SPEC_ONLY',
		recommendations: [],
		activityScore:   0,
		lastIndexedAt:   '2026-05-11T22:00:00.000Z',
		contentHash:     'a'.repeat(64),
		gates:           {},
	};
}

// ── CouchDB writer ───────────────────────────────────────────────────────────

describe('writeCardToCouchDB', () => {
	it('returns skipped=disabled when enabled is false (default)', async () => {
		const fetcher = vi.fn();
		const r = await writeCardToCouchDB(makeCard(), { enabled: false, fetchImpl: fetcher });
		expect(r.wrote).toBe(false);
		expect(r.skipped).toBe('disabled');
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('returns skipped=test-env-blocked under VITEST even when enabled=true', async () => {
		// VITEST is set automatically by the test runner; explicitly enabled=true
		// must NOT bypass the env gate without allowLiveWritesInTests:true.
		const fetcher = vi.fn();
		const r = await writeCardToCouchDB(makeCard(), { enabled: true, fetchImpl: fetcher });
		expect(r.wrote).toBe(false);
		expect(r.skipped).toBe('test-env-blocked');
		expect(fetcher).not.toHaveBeenCalled(); // ← the critical invariant
	});

	it('respects allowLiveWritesInTests=true for integration suites that DO want live HTTP', async () => {
		const fetcher = vi.fn()
			// initial GET → not found, so write a new doc
			.mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response)
			.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as unknown as Response);
		const r = await writeCardToCouchDB(makeCard(), {
			enabled: true,
			fetchImpl: fetcher,
			allowLiveWritesInTests: true,
		});
		expect(r.wrote).toBe(true);
		expect(fetcher).toHaveBeenCalledTimes(2); // GET then PUT
	});

	it('skips PUT when stored contentHash matches the candidate', async () => {
		const card = makeCard();
		const fetcher = vi.fn().mockResolvedValueOnce({
			ok:   true,
			json: async () => ({ _id: card.id, _rev: '1-abc', contentHash: card.contentHash }),
		} as unknown as Response);
		const r = await writeCardToCouchDB(card, {
			enabled: true,
			fetchImpl: fetcher,
			allowLiveWritesInTests: true,
		});
		expect(r.wrote).toBe(false);
		expect(r.skipped).toBe('unchanged');
		expect(fetcher).toHaveBeenCalledTimes(1); // GET only, no PUT
	});

	it('captures HTTP errors as error fields instead of throwing', async () => {
		const fetcher = vi.fn()
			.mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response)
			.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ reason: 'boom' }) } as unknown as Response);
		const r = await writeCardToCouchDB(makeCard(), {
			enabled: true,
			fetchImpl: fetcher,
			allowLiveWritesInTests: true,
		});
		expect(r.wrote).toBe(false);
		expect(r.error).toBe('boom');
	});
});

// ── Qdrant backfill ──────────────────────────────────────────────────────────

describe('backfillQdrantPayload', () => {
	it('returns skipped=disabled when enabled is false', async () => {
		const fetcher = vi.fn();
		const r = await backfillQdrantPayload(makeCard(), { enabled: false, fetchImpl: fetcher });
		expect(r.wrote).toBe(false);
		expect(r.skipped).toBe('disabled');
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('returns skipped=test-env-blocked under VITEST even when enabled=true', async () => {
		const fetcher = vi.fn();
		const r = await backfillQdrantPayload(makeCard(), { enabled: true, fetchImpl: fetcher });
		expect(r.wrote).toBe(false);
		expect(r.skipped).toBe('test-env-blocked');
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('sends a set_payload POST with prefix filter when allowLiveWritesInTests=true', async () => {
		const fetcher = vi.fn().mockResolvedValueOnce({
			ok:   true,
			json: async () => ({ result: { status: 'ok' }, usage: { points: 12 } }),
		} as unknown as Response);
		const r = await backfillQdrantPayload(makeCard('src/lib/x'), {
			enabled: true,
			fetchImpl: fetcher,
			allowLiveWritesInTests: true,
		});
		expect(r.wrote).toBe(true);
		expect(r.pointsTouched).toBe(12);
		expect(fetcher).toHaveBeenCalledOnce();
		const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
		expect(url).toContain('/collections/codebase_chunks_768/points/payload');
		const body = JSON.parse(init.body as string);
		expect(body.payload.agents_card_id).toBe('agents:dir:src-lib-x');
		expect(body.payload.feature_keys).toEqual(['k1', 'k2']);
		expect(body.filter.should).toHaveLength(2); // file_path + path
	});

	it('captures HTTP errors instead of throwing', async () => {
		const fetcher = vi.fn().mockResolvedValueOnce({
			ok:     false,
			status: 503,
			json:   async () => ({ status: { error: 'overloaded' } }),
		} as unknown as Response);
		const r = await backfillQdrantPayload(makeCard(), {
			enabled: true,
			fetchImpl: fetcher,
			allowLiveWritesInTests: true,
		});
		expect(r.wrote).toBe(false);
		expect(r.error).toBe('overloaded');
	});
});
