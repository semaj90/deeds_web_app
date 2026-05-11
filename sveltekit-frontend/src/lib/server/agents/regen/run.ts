/**
 * Phase A3 (part 1) — runRegen() orchestrator.
 *
 * Glues Phase A1 loaders + Phase A2 section builders into a single
 * orchestrated regen pass. Honors --dry-run, --limit, --force, --redisOnly,
 * acquires a single-writer Redis lock, and diff-and-skips unchanged cards.
 *
 * SvelteKit-importable (an API route can call this directly). The thin
 * .mjs CLI shell follows in a separate file and just exposes this fn over
 * the command line with the banner + JSON summary contract.
 *
 * Reference: docs/design/2026-05-11_agents-directory-card-regen.md §3.
 */

import { buildRegenContext } from './loaders/build-context.js';
import { loadExistingCard } from './loaders/existing-card.js';
import { composeCard } from './section-builders.js';
import { writeCardToRedis } from '../agents-card-store.js';
import type { BuildRegenContextOptions, RegenContext } from './loaders/types.js';
import type { AgentsDirectoryCard } from '../agents-card-store.js';

// ── CLI / API contract ───────────────────────────────────────────────────────

export interface RegenCliOptions {
	/** Single-directory mode (mutually exclusive with `all`). */
	dir?:        string;
	/** Full sweep across all dirs in the codebase graph. */
	all?:        boolean;
	/** Compute everything but skip writes. */
	dryRun?:     boolean;
	/** Force re-encode even if contentHash matches existing card. */
	force?:      boolean;
	/** Cap dirs processed (smoke convenience). */
	limit?:      number;
	/** Only write Redis (skip CouchDB / Qdrant — Phase A4 lanes). */
	redisOnly?:  boolean;
	/** Forwarded to buildRegenContext (skip activity rollup / cluster summaries). */
	ctxOptions?: BuildRegenContextOptions;
}

export interface RegenSignalSources {
	graphNodes:        number;
	karpathyScores:    number;
	clusterSummaries:  number;
	featureRows:       number;
	activityRows:      number;
}

export interface RegenFailure {
	dir:   string;
	error: string;
}

export interface RegenCliResult {
	dirCount:       number;
	changedCount:   number;
	unchangedCount: number;
	skippedCount:   number;
	failedCount:    number;
	failures:       RegenFailure[];
	redisWrites:    number;
	durationMs:     number;
	signalSourcesLoaded: RegenSignalSources;
	dryRun:         boolean;
	force:          boolean;
}

// ── Lock primitives (dependency-injected so tests can stub) ──────────────────

/** Minimal interface a runtime must satisfy to participate in regen. */
export interface RegenLockProvider {
	acquire(runId: string, ttlSeconds: number): Promise<boolean>;
	release(runId: string): Promise<void>;
}

/** No-op lock — used when --dry-run + tests, since nothing is being written. */
export const NOOP_LOCK: RegenLockProvider = {
	async acquire() { return true; },
	async release() { /* noop */ },
};

const LOCK_KEY = 'agents:regen:lock';
const LOCK_TTL_SECONDS = 600;

// ── Main entry ───────────────────────────────────────────────────────────────

export interface RunRegenDeps {
	/** Lock provider. Default = NOOP_LOCK in dry-run, redis-backed in real runs. */
	lock?: RegenLockProvider;
	/** Inject a pre-built RegenContext (skip loader phase entirely). Used by tests. */
	ctx?: RegenContext;
	/** Override the per-dir card composer (used by tests for deterministic output). */
	composeFn?: typeof composeCard;
	/** Override the per-dir existing-card lookup (used by tests). */
	loadExistingFn?: (dirPath: string) => Promise<{ card: AgentsDirectoryCard | null }>;
	/** Override the Redis writer (used by tests). */
	writeFn?: (card: AgentsDirectoryCard) => Promise<boolean>;
}

export async function runRegen(
	opts: RegenCliOptions,
	deps: RunRegenDeps = {},
): Promise<RegenCliResult> {
	const startMs = Date.now();
	const dryRun  = opts.dryRun ?? false;
	const force   = opts.force ?? false;
	const runId   = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const lock    = deps.lock ?? (dryRun ? NOOP_LOCK : redisLock());
	const compose = deps.composeFn ?? composeCard;
	const loadEx  = deps.loadExistingFn ?? loadExistingCard;
	const write   = deps.writeFn ?? writeCardToRedis;

	const failures: RegenFailure[] = [];
	let changedCount   = 0;
	let unchangedCount = 0;
	let skippedCount   = 0;
	let redisWrites    = 0;

	// 1. Acquire lock (real runs only).
	if (!dryRun) {
		const acquired = await lock.acquire(runId, LOCK_TTL_SECONDS);
		if (!acquired) {
			throw new Error('agents:regen lock already held; another runner is in progress');
		}
	}

	try {
		// 2. Build (or inject) the shared context.
		const ctx = deps.ctx ?? (await buildRegenContext(opts.ctxOptions ?? {}));

		// 3. Resolve the dir list.
		const allDirs = [...ctx.graph.directories.keys()];
		const targetDirs = resolveTargetDirs(opts, allDirs);

		// 4. Per-dir compose + diff + write.
		for (const dir of targetDirs) {
			try {
				const existing = await loadEx(dir);
				const composed = compose(dir, ctx, existing.card ?? null);

				if (!composed.changed && !force) {
					unchangedCount++;
					continue;
				}

				if (dryRun) {
					skippedCount++;
					continue;
				}

				const didWrite = await write(composed.card);
				if (didWrite) redisWrites++;
				changedCount++;
			} catch (err) {
				failures.push({ dir, error: String((err as Error)?.message ?? err) });
			}
		}

		const signalSourcesLoaded: RegenSignalSources = {
			graphNodes:       ctx.graph.fileCount,
			karpathyScores:   ctx.karpathy.entryCount,
			clusterSummaries: ctx.clusters.entryCount,
			featureRows:      ctx.features.features.length,
			activityRows:     ctx.activity.rowsScanned,
		};

		return {
			dirCount:       targetDirs.length,
			changedCount,
			unchangedCount,
			skippedCount,
			failedCount:    failures.length,
			failures,
			redisWrites,
			durationMs:     Date.now() - startMs,
			signalSourcesLoaded,
			dryRun,
			force,
		};
	} finally {
		if (!dryRun) await lock.release(runId);
	}
}

// ── Internals ────────────────────────────────────────────────────────────────

function resolveTargetDirs(opts: RegenCliOptions, allDirs: readonly string[]): string[] {
	if (opts.dir) return [opts.dir];
	const all = opts.all ? [...allDirs] : [];
	if (typeof opts.limit === 'number' && opts.limit > 0) return all.slice(0, opts.limit);
	return all;
}

function redisLock(): RegenLockProvider {
	// Lazy-import so tests + dry-run paths never touch Redis.
	return {
		async acquire(runId, ttlSeconds) {
			try {
				const { getRedis } = await import('../../redis.js');
				const redis = getRedis() as unknown as { set: (k: string, v: string, ex: 'EX', s: number, nx: 'NX') => Promise<string | null> };
				const result = await redis.set(LOCK_KEY, runId, 'EX', ttlSeconds, 'NX');
				return result === 'OK';
			} catch {
				// Redis unreachable — refuse to write (caller treats false as held).
				return false;
			}
		},
		async release(runId) {
			try {
				const { getRedis } = await import('../../redis.js');
				const redis = getRedis() as unknown as { get: (k: string) => Promise<string | null>; del: (k: string) => Promise<number> };
				const held = await redis.get(LOCK_KEY);
				if (held === runId) await redis.del(LOCK_KEY);
			} catch {
				// nothing to do
			}
		},
	};
}
