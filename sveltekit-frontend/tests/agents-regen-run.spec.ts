// @vitest-environment node
/**
 * Phase A3 (part 1) — runRegen() orchestrator contract.
 *
 * Dependency-injects RegenContext, composer, existing-card loader, and
 * Redis writer so the test is fully isolated from real backends. Verifies
 * the lock acquire/release, diff-and-skip, --force override, --limit cap,
 * --dryRun zero-writes, and per-dir failure isolation.
 *
 * Reference: docs/design/2026-05-11_agents-directory-card-regen.md §3 + §5.
 */

import { describe, expect, it, vi } from 'vitest';

import { runRegen, NOOP_LOCK } from '../src/lib/server/agents/regen/run.js';
import type { RegenContext, AgentsDirectoryCard as Card } from '../src/lib/server/agents/regen/loaders/types.js';

// ── Fixture builders ─────────────────────────────────────────────────────────

function makeCtx(dirNames: readonly string[]): RegenContext {
	const now = '2026-05-11T22:00:00.000Z';
	const directories = new Map();
	for (const d of dirNames) directories.set(d, { rel: d, fileCount: 1 });
	return {
		runStartedAt: now,
		graph: {
			createdAt:   now,
			repoRoot:    '/r',
			files:       new Map(),
			directories,
			fileCount:   dirNames.length,
			dirCount:    dirNames.length,
		},
		karpathy:    { scores: new Map(), loadedAt: now, entryCount: 2, source: 'mock' },
		clusters:    { summaries: new Map(), loadedAt: now, entryCount: 1, source: 'mock' },
		features:    { features: [{ featureKey: 'f1', featureName: 'F1', description: '', laneIds: [], status: 'active', confidence: 1, files: [] }], byDir: new Map(), loadedAt: now, source: 'mock' },
		activity:    { byDir: new Map(), loadedAt: now, rowsScanned: 5, source: 'mock' },
		pathAliases: { aliases: new Map(), loadedAt: now, source: 'mock' },
		diagnostics: { loaderResults: {} as RegenContext['diagnostics']['loaderResults'], totalDurationMs: 0, warnings: [] },
	};
}

function makeCard(dirPath: string, hash: string): Card {
	return {
		id:              `agents:dir:${dirPath.replace(/\//g, '-')}`,
		dirPath,
		title:           'T',
		summary:         '',
		staticImports:   [],
		dynamicImports:  [],
		pathAliases:     [],
		featureKeys:     [],
		routeSurfaces:   [],
		schemaTables:    [],
		qdrantTags:      [],
		auditStatus:     'SPEC_ONLY',
		recommendations: [],
		activityScore:   0,
		lastIndexedAt:   '2026-05-11T22:00:00.000Z',
		contentHash:     hash.padEnd(64, '0'),
		gates:           {},
	};
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runRegen', () => {
	it('processes --all with a target dir list and reports the summary shape', async () => {
		const ctx = makeCtx(['src/a', 'src/b']);
		const compose = vi.fn((dir: string) => ({
			card: makeCard(dir, 'h-' + dir),
			contentHash: ('h-' + dir).padEnd(64, '0'),
			changed: true,
		}));
		const write = vi.fn(async () => true);
		const loadEx = vi.fn(async () => ({ card: null }));
		const couchFn = vi.fn(async () => ({ wrote: true, skipped: null, docId: 'x' }));
		const qdrantFn = vi.fn(async () => ({ wrote: true, skipped: null, pointsTouched: 7 }));

		const result = await runRegen(
			{ all: true, dryRun: false },
			{ ctx, lock: NOOP_LOCK, composeFn: compose, loadExistingFn: loadEx, writeFn: write, couchWriteFn: couchFn, qdrantBackfillFn: qdrantFn },
		);

		expect(result.dirCount).toBe(2);
		expect(result.changedCount).toBe(2);
		expect(result.redisWrites).toBe(2);
		expect(result.couchWrites).toBe(2);
		expect(result.qdrantWrites).toBe(2);
		expect(result.qdrantPointsTouched).toBe(14);
		expect(result.failedCount).toBe(0);
		expect(result.signalSourcesLoaded.graphNodes).toBe(2);
		expect(result.signalSourcesLoaded.karpathyScores).toBe(2);
		// Verify the orchestrator passed `enabled: true` (since dryRun=false && redisOnly=false)
		expect(couchFn.mock.calls[0][1]).toBe(true);
		expect(qdrantFn.mock.calls[0][1]).toBe(true);
	});

	it('--redis-only disables couch + qdrant writers but still writes Redis', async () => {
		const ctx = makeCtx(['src/a']);
		const couchFn  = vi.fn(async (_card, enabled: boolean) => ({ wrote: false, skipped: enabled ? null : ('disabled' as const), docId: 'x' }));
		const qdrantFn = vi.fn(async (_card, enabled: boolean) => ({ wrote: false, skipped: enabled ? null : ('disabled' as const), pointsTouched: 0 }));
		const result = await runRegen(
			{ all: true, redisOnly: true },
			{
				ctx, lock: NOOP_LOCK,
				composeFn: () => ({ card: makeCard('src/a', 'h'), contentHash: 'h'.padEnd(64, '0'), changed: true }),
				loadExistingFn: async () => ({ card: null }),
				writeFn: async () => true,
				couchWriteFn: couchFn, qdrantBackfillFn: qdrantFn,
			},
		);
		expect(result.redisWrites).toBe(1);
		expect(result.couchWrites).toBe(0);
		expect(result.qdrantWrites).toBe(0);
		expect(couchFn.mock.calls[0][1]).toBe(false);   // enabled=false passed through
		expect(qdrantFn.mock.calls[0][1]).toBe(false);
	});

	it('dryRun=true disables all 3 writers (redis + couch + qdrant)', async () => {
		const ctx = makeCtx(['src/a']);
		const couchFn  = vi.fn(async () => ({ wrote: false, skipped: 'disabled' as const, docId: 'x' }));
		const qdrantFn = vi.fn(async () => ({ wrote: false, skipped: 'disabled' as const, pointsTouched: 0 }));
		const result = await runRegen(
			{ all: true, dryRun: true },
			{
				ctx, lock: NOOP_LOCK,
				composeFn: () => ({ card: makeCard('src/a', 'h'), contentHash: 'h'.padEnd(64, '0'), changed: true }),
				loadExistingFn: async () => ({ card: null }),
				writeFn: vi.fn(async () => true),
				couchWriteFn: couchFn, qdrantBackfillFn: qdrantFn,
			},
		);
		expect(result.redisWrites).toBe(0);
		expect(result.couchWrites).toBe(0);
		expect(result.qdrantWrites).toBe(0);
		expect(result.skippedCount).toBe(1);
		// dry-run path short-circuits before couch/qdrant call sites
		expect(couchFn).not.toHaveBeenCalled();
		expect(qdrantFn).not.toHaveBeenCalled();
	});

	it('honors --limit cap', async () => {
		const ctx = makeCtx(['a', 'b', 'c', 'd']);
		const compose = vi.fn((dir: string) => ({ card: makeCard(dir, 'x'), contentHash: 'x'.padEnd(64, '0'), changed: true }));
		const result = await runRegen(
			{ all: true, limit: 2, dryRun: true },
			{ ctx, lock: NOOP_LOCK, composeFn: compose, loadExistingFn: async () => ({ card: null }), writeFn: async () => true },
		);
		expect(result.dirCount).toBe(2);
		expect(compose).toHaveBeenCalledTimes(2);
	});

	it('reports redisWrites=0 under --dry-run regardless of changed cards', async () => {
		const ctx = makeCtx(['x']);
		const write = vi.fn(async () => true);
		const result = await runRegen(
			{ all: true, dryRun: true },
			{
				ctx,
				lock: NOOP_LOCK,
				composeFn: () => ({ card: makeCard('x', 'h'), contentHash: 'h'.padEnd(64, '0'), changed: true }),
				loadExistingFn: async () => ({ card: null }),
				writeFn: write,
			},
		);
		expect(result.redisWrites).toBe(0);
		expect(result.skippedCount).toBe(1);
		expect(write).not.toHaveBeenCalled();
	});

	it('skips writes when contentHash unchanged (diff-and-skip)', async () => {
		const ctx = makeCtx(['x']);
		const existing = makeCard('x', 'same');
		const write = vi.fn(async () => true);
		const result = await runRegen(
			{ all: true, dryRun: false },
			{
				ctx,
				lock: NOOP_LOCK,
				composeFn: () => ({ card: existing, contentHash: existing.contentHash, changed: false }),
				loadExistingFn: async () => ({ card: existing }),
				writeFn: write,
			},
		);
		expect(result.changedCount).toBe(0);
		expect(result.unchangedCount).toBe(1);
		expect(result.redisWrites).toBe(0);
		expect(write).not.toHaveBeenCalled();
	});

	it('forces re-encode under --force even when unchanged', async () => {
		const ctx = makeCtx(['x']);
		const existing = makeCard('x', 'same');
		const write = vi.fn(async () => true);
		const result = await runRegen(
			{ all: true, force: true },
			{
				ctx,
				lock: NOOP_LOCK,
				composeFn: () => ({ card: existing, contentHash: existing.contentHash, changed: false }),
				loadExistingFn: async () => ({ card: existing }),
				writeFn: write,
			},
		);
		expect(result.changedCount).toBe(1);
		expect(write).toHaveBeenCalledOnce();
	});

	it('--dir routes to a single directory', async () => {
		const ctx = makeCtx(['a', 'b', 'c']);
		const compose = vi.fn((dir: string) => ({ card: makeCard(dir, 'h'), contentHash: 'h'.padEnd(64, '0'), changed: true }));
		const result = await runRegen(
			{ dir: 'src/specific', dryRun: true },
			{ ctx, lock: NOOP_LOCK, composeFn: compose, loadExistingFn: async () => ({ card: null }), writeFn: async () => true },
		);
		expect(result.dirCount).toBe(1);
		expect(compose).toHaveBeenCalledWith('src/specific', ctx, null);
	});

	it('isolates per-dir failures (one throws, others continue)', async () => {
		const ctx = makeCtx(['ok1', 'fail', 'ok2']);
		const compose = vi.fn((dir: string) => {
			if (dir === 'fail') throw new Error('boom');
			return { card: makeCard(dir, 'h'), contentHash: 'h'.padEnd(64, '0'), changed: true };
		});
		const result = await runRegen(
			{ all: true, dryRun: true },
			{ ctx, lock: NOOP_LOCK, composeFn: compose, loadExistingFn: async () => ({ card: null }), writeFn: async () => true },
		);
		expect(result.failedCount).toBe(1);
		expect(result.failures[0].dir).toBe('fail');
		expect(result.failures[0].error).toContain('boom');
		expect(result.skippedCount).toBe(2); // ok1, ok2 still composed
	});

	it('refuses to start when lock acquire returns false', async () => {
		const ctx = makeCtx(['x']);
		const lock = { acquire: vi.fn(async () => false), release: vi.fn(async () => undefined) };
		await expect(runRegen(
			{ all: true },
			{ ctx, lock, composeFn: () => ({ card: makeCard('x', 'h'), contentHash: 'h'.padEnd(64, '0'), changed: true }), loadExistingFn: async () => ({ card: null }), writeFn: async () => true },
		)).rejects.toThrow(/lock already held/);
		expect(lock.acquire).toHaveBeenCalledOnce();
		expect(lock.release).not.toHaveBeenCalled();
	});

	it('releases the lock even when a per-dir compose throws', async () => {
		const ctx = makeCtx(['fail']);
		const lock = { acquire: vi.fn(async () => true), release: vi.fn(async () => undefined) };
		const result = await runRegen(
			{ all: true },
			{
				ctx,
				lock,
				composeFn: () => { throw new Error('explode'); },
				loadExistingFn: async () => ({ card: null }),
				writeFn: async () => true,
			},
		);
		expect(result.failedCount).toBe(1);
		expect(lock.release).toHaveBeenCalledOnce();
	});

	it('does NOT touch the lock under --dry-run', async () => {
		const ctx = makeCtx(['x']);
		const lock = { acquire: vi.fn(async () => true), release: vi.fn(async () => undefined) };
		await runRegen(
			{ all: true, dryRun: true },
			{ ctx, lock, composeFn: () => ({ card: makeCard('x', 'h'), contentHash: 'h'.padEnd(64, '0'), changed: true }), loadExistingFn: async () => ({ card: null }), writeFn: async () => true },
		);
		expect(lock.acquire).not.toHaveBeenCalled();
		expect(lock.release).not.toHaveBeenCalled();
	});
});
