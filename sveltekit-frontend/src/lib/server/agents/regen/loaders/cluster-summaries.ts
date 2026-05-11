/**
 * Loader 3 — `ace:cluster:summary:*` Redis keys → Map<clusterId, prose>.
 *
 * Phase A1.4 of `docs/design/2026-05-11_agents-regen-loaders.md`.
 *
 * SOM cluster summaries are LLM-synthesised per cluster by the cluster-summary
 * worker. Each value is a prose paragraph (~200-800 chars). Section builders
 * inject the matching cluster summary into the AgentsDirectoryCard as the
 * "high-level context" the assembler can read.
 *
 * Bounded SCAN to keep latency predictable — a small ACE prompt path should
 * never block on Redis enumeration.
 */

import type { LoadClusterSummariesResult } from './types.js';

const DEFAULT_KEY_PATTERN = 'ace:cluster:summary:*';
const HARD_CAP_SCAN_CALLS = 8;
const SCAN_COUNT_PER_CALL = '500';

export interface LoadClusterSummariesOptions {
	keyPattern?: string;
}

interface RedisLike {
	scan: (cursor: string, ...args: unknown[]) => Promise<[string, string[]]>;
	mget?: (keys: string[]) => Promise<(string | null)[]>;
	get:  (k: string) => Promise<string | null>;
}

export async function loadClusterSummaries(
	opts: LoadClusterSummariesOptions = {},
): Promise<LoadClusterSummariesResult> {
	const keyPattern = opts.keyPattern ?? DEFAULT_KEY_PATTERN;
	const loadedAt   = new Date().toISOString();
	const source     = `redis:${keyPattern}`;
	const summaries  = new Map<string, string>();

	let redis: RedisLike;
	try {
		const { getRedis } = await import('$lib/server/redis');
		redis = getRedis() as unknown as RedisLike;
	} catch {
		return { summaries, loadedAt, entryCount: 0, source: `${source} (unreachable)` };
	}

	const keys: string[] = [];
	let cursor = '0';
	for (let i = 0; i < HARD_CAP_SCAN_CALLS; i++) {
		try {
			const [next, batch] = await redis.scan(cursor, 'MATCH', keyPattern, 'COUNT', SCAN_COUNT_PER_CALL);
			keys.push(...batch);
			cursor = next;
			if (cursor === '0') break;
		} catch {
			// Mid-scan failure — return what we have.
			break;
		}
	}

	if (keys.length === 0) {
		return { summaries, loadedAt, entryCount: 0, source };
	}

	const values = await readValues(redis, keys);
	const prefix = keyPattern.replace(/\*$/, '');
	for (let i = 0; i < keys.length; i++) {
		const value = values[i];
		if (typeof value !== 'string' || value.length === 0) continue;
		const clusterId = keys[i].startsWith(prefix) ? keys[i].slice(prefix.length) : keys[i];
		if (!clusterId) continue;
		summaries.set(clusterId, value);
	}

	return { summaries, loadedAt, entryCount: summaries.size, source };
}

// ── Internals ────────────────────────────────────────────────────────────────

async function readValues(redis: RedisLike, keys: readonly string[]): Promise<(string | null)[]> {
	if (typeof redis.mget === 'function') {
		try {
			return await redis.mget([...keys]);
		} catch {
			// fall through to per-key
		}
	}
	return Promise.all(keys.map((k) => redis.get(k).catch(() => null)));
}
