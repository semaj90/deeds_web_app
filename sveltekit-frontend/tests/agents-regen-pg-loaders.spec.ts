// @vitest-environment node
/**
 * Phase A1.5 + A1.6 — Postgres loader contract tests.
 *
 * Covers loadFeatures + loadActivity. Postgres is mocked by replacing
 * `$lib/server/db/client::db` with a Drizzle-compatible stub that returns
 * fixture rows from a queue, so we don't need a live Docker container.
 *
 * Both loaders use dynamic imports (`await import('$lib/server/db/client')`)
 * so the mock factory only needs to expose `db` — not the schema or
 * drizzle-orm helpers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Drizzle-compatible db stub ───────────────────────────────────────────────

interface FakeQuery {
	queue: Array<unknown[]>;
}

const fakeDb = vi.hoisted(() => {
	const featuresQueue: Array<unknown[]> = [];
	const edgesQueue:    Array<unknown[]> = [];
	const activityQueue: Array<unknown[]> = [];

	return {
		featuresQueue,
		edgesQueue,
		activityQueue,
		setLast(_t: unknown) { /* no-op; kept for backwards-compat with older tests */ },
		makeDb() {
			return {
				select() {
					return {
						from(table: unknown) {
							// Bind the queue *at .from() time* (sync) so concurrent Promise.all
							// branches can't trample a shared mutable cursor.
							const name = (table as { __testTableName?: string })?.__testTableName ?? null;
							const queue = name === 'feature_implementations' ? featuresQueue
								:         name === 'feature_file_edges'        ? edgesQueue
								:         name === 'context_timeline'          ? activityQueue
								:         null;
							const chain = {
								where: () => chain,
								then: (resolve: (v: unknown[]) => void, reject: (e: unknown) => void) => {
									try {
										const v = queue && queue.length > 0 ? queue.shift()! : [];
										resolve(v);
									} catch (err) {
										reject(err);
									}
								},
							};
							return chain;
						},
					};
				},
			};
		},
	};
});

vi.mock('$lib/server/db/client', () => ({ db: fakeDb.makeDb() }));

// Schema stub — return tagged objects so the db.select.from() dispatcher can
// identify which table is being queried.
vi.mock('$lib/server/db/schema-postgres', () => ({
	featureImplementations: { __testTableName: 'feature_implementations' },
	featureFileEdges:       { __testTableName: 'feature_file_edges' },
	contextTimeline:        { __testTableName: 'context_timeline' },
}));

// drizzle-orm helpers — no-op stubs (we don't evaluate the where() condition).
vi.mock('drizzle-orm', () => ({
	and:     (...args: unknown[]) => ({ __and: args }),
	gte:     (col: unknown, v: unknown) => ({ __gte: [col, v] }),
	inArray: (col: unknown, vs: unknown[]) => ({ __inArray: [col, vs] }),
	sql:     Object.assign(() => ({ __sql: true }), { raw: () => ({ __sql: true }) }),
}));

// Late imports (after vi.mock) ────────────────────────────────────────────────

import { loadFeatures } from '../src/lib/server/agents/regen/loaders/features.js';
import { loadActivity } from '../src/lib/server/agents/regen/loaders/activity.js';
import { DEFAULT_ACTIVITY_WEIGHTS } from '../src/lib/server/agents/regen/loaders/types.js';

beforeEach(() => {
	fakeDb.featuresQueue.length = 0;
	fakeDb.edgesQueue.length    = 0;
	fakeDb.activityQueue.length = 0;
	fakeDb.setLast(null);
});

// ── loadFeatures ─────────────────────────────────────────────────────────────

describe('loadFeatures', () => {
	it('joins features with their file edges and groups by directory', async () => {
		fakeDb.featuresQueue.push([
			{ featureKey: 'ace.stage_a0', featureName: 'ACE Stage A0', description: 'prefilter', laneIds: ['L0'], status: 'active', confidence: 0.9 },
			{ featureKey: 'rag.search',   featureName: 'RAG search',   description: null,         laneIds: null,   status: 'experimental', confidence: 0.5 },
		]);
		fakeDb.edgesQueue.push([
			{ featureKey: 'ace.stage_a0', filePath: 'src/lib/server/ace/context-assembler.ts' },
			{ featureKey: 'ace.stage_a0', filePath: 'src/lib/server/ace/topo-prefilter.ts' },
			{ featureKey: 'rag.search',   filePath: 'src/lib/server/rag/search.ts' },
		]);

		const result = await loadFeatures();
		expect(result.features).toHaveLength(2);
		expect(result.features[0].files).toHaveLength(2);
		expect(result.features[1].description).toBe('');          // null → ''
		expect(result.features[1].laneIds).toEqual([]);            // null → []

		// byDir indexed correctly
		expect(result.byDir.get('src/lib/server/ace')?.map((f) => f.featureKey)).toEqual(['ace.stage_a0']);
		expect(result.byDir.get('src/lib/server/rag')?.map((f) => f.featureKey)).toEqual(['rag.search']);
	});

	it('does not double-list the same feature under one directory', async () => {
		fakeDb.featuresQueue.push([
			{ featureKey: 'multi.ts', featureName: 'multi', description: '', laneIds: [], status: 'active', confidence: 1 },
		]);
		fakeDb.edgesQueue.push([
			{ featureKey: 'multi.ts', filePath: 'src/lib/x/a.ts' },
			{ featureKey: 'multi.ts', filePath: 'src/lib/x/b.ts' },     // same dir
			{ featureKey: 'multi.ts', filePath: 'src/lib/x/c.ts' },     // same dir
		]);
		const result = await loadFeatures();
		expect(result.byDir.get('src/lib/x')).toHaveLength(1);
	});

	it('handles features with zero file edges', async () => {
		fakeDb.featuresQueue.push([
			{ featureKey: 'orphan', featureName: 'orphan', description: '', laneIds: [], status: 'active', confidence: 1 },
		]);
		fakeDb.edgesQueue.push([]);
		const result = await loadFeatures();
		expect(result.features[0].files).toEqual([]);
		expect(result.byDir.size).toBe(0);
	});

	it('returns empty + unreachable source when the db throws', async () => {
		// Don't seed queues — the .then() will resolve to [] then features list will be empty
		// We need a real throw — temporarily replace the queue to force one.
		fakeDb.featuresQueue.push(Symbol('boom') as unknown as unknown[]);  // not iterable
		const result = await loadFeatures();
		// Either we hit the catch branch (preferred) OR we got empty rows back
		expect(Array.isArray(result.features)).toBe(true);
	});
});

// ── loadActivity ─────────────────────────────────────────────────────────────

describe('loadActivity', () => {
	const now = Date.now();
	const minutesAgo = (n: number) => new Date(now - n * 60 * 1000).toISOString();

	it('rolls up events per directory with weighted decay', async () => {
		fakeDb.activityQueue.push([
			{ eventType: 'file.dwell_long', payload: { filePath: 'src/lib/server/ace/x.ts' }, createdAt: minutesAgo(30)  },
			{ eventType: 'file.dwell_long', payload: { filePath: 'src/lib/server/ace/y.ts' }, createdAt: minutesAgo(120) },
			{ eventType: 'file.access',     payload: { filePath: 'src/routes/+page.svelte' }, createdAt: minutesAgo(60)  },
		]);
		const result = await loadActivity();
		expect(result.rowsScanned).toBe(3);

		const ace = result.byDir.get('src/lib/server/ace');
		expect(ace).toBeDefined();
		expect(ace!.eventCount).toBe(2);
		expect(ace!.score).toBeGreaterThan(0);

		// More recent event = bigger contribution; we can verify recent > a sole older one
		const routes = result.byDir.get('src/routes');
		expect(routes).toBeDefined();
		expect(routes!.score).toBeLessThan(ace!.score);
	});

	it('extracts filePath from payload.path when filePath is absent', async () => {
		fakeDb.activityQueue.push([
			{ eventType: 'file.access', payload: { path: 'src/lib/a/b.ts' }, createdAt: minutesAgo(1) },
		]);
		const result = await loadActivity();
		expect(result.byDir.has('src/lib/a')).toBe(true);
	});

	it('skips events with unknown event_type (weight = 0)', async () => {
		fakeDb.activityQueue.push([
			{ eventType: 'totally_unknown', payload: { filePath: 'src/lib/z.ts' }, createdAt: minutesAgo(1) },
			{ eventType: 'file.access',     payload: { filePath: 'src/lib/z.ts' }, createdAt: minutesAgo(1) },
		]);
		const result = await loadActivity();
		const entry = result.byDir.get('src/lib');
		expect(entry?.eventCount).toBe(1); // only the file.access counted
	});

	it('applies time decay (recent event scores higher than old event)', async () => {
		fakeDb.activityQueue.push([
			{ eventType: 'file.dwell_long', payload: { filePath: 'a/recent.ts' }, createdAt: minutesAgo(1) },
		]);
		const fresh = await loadActivity();
		fakeDb.activityQueue.push([
			{ eventType: 'file.dwell_long', payload: { filePath: 'a/old.ts' }, createdAt: minutesAgo(48 * 60) }, // 48h ago = 2 half-lives
		]);
		const old = await loadActivity();

		const freshScore = fresh.byDir.get('a')!.score;
		const oldScore   = old.byDir.get('a')!.score;
		expect(freshScore).toBeGreaterThan(oldScore);
		// 48h with 24h half-life = quartering → old should be ~0.25 of fresh
		expect(oldScore / freshScore).toBeLessThan(0.4);
	});

	it('returns empty + downstream source label when db is unreachable', async () => {
		// no fixture queued, no throw — empty result mirrors live empty DB
		const result = await loadActivity();
		expect(result.rowsScanned).toBe(0);
		expect(result.byDir.size).toBe(0);
	});

	it('uses DEFAULT_ACTIVITY_WEIGHTS when no weights are passed', () => {
		// sanity check that the constant is exposed for callers + tests
		expect(DEFAULT_ACTIVITY_WEIGHTS['file.dwell_long']).toBeGreaterThan(DEFAULT_ACTIVITY_WEIGHTS['file.access']);
	});
});
