/**
 * Loader 2 — `gpu:karpathy:scores` Redis hash → Map<filePath, KarpathyBlend>.
 *
 * Phase A1.3 of `docs/design/2026-05-11_agents-regen-loaders.md`.
 *
 * The blend is 0.4·pr + 0.3·attn + 0.3·authority, refreshed by the daily
 * Karpathy cron (`scripts/karpathy-gpu-enrich.mjs`). Section builders use it
 * to rank files inside a directory by graph authority.
 *
 * Per-entry failures (garbage JSON) are skipped + logged; the remaining
 * entries still load. Missing key returns an empty Map — signals the cron
 * hasn't run yet, which is fine for first-time regen runs.
 */

import type {
	LoadKarpathyResult,
	KarpathyBlend,
} from './types.js';

const DEFAULT_REDIS_KEY = 'gpu:karpathy:scores';

export interface LoadKarpathyOptions {
	redisKey?: string;
}

interface RedisLike {
	hgetall: (key: string) => Promise<Record<string, string>>;
}

export async function loadKarpathyScores(opts: LoadKarpathyOptions = {}): Promise<LoadKarpathyResult> {
	const redisKey = opts.redisKey ?? DEFAULT_REDIS_KEY;
	const loadedAt = new Date().toISOString();
	const source   = `redis:${redisKey}`;
	const scores   = new Map<string, KarpathyBlend>();

	let raw: Record<string, string> = {};
	try {
		const { getRedis } = await import('$lib/server/redis');
		const redis = getRedis() as unknown as RedisLike;
		raw = await redis.hgetall(redisKey);
	} catch {
		// Redis unreachable → return empty Map; section builders use defaults.
		return { scores, loadedAt, entryCount: 0, source: `${source} (unreachable)` };
	}

	for (const [filePath, json] of Object.entries(raw ?? {})) {
		const blend = parseBlend(json);
		if (blend) scores.set(filePath, blend);
	}

	return { scores, loadedAt, entryCount: scores.size, source };
}

// ── Internals ────────────────────────────────────────────────────────────────

function parseBlend(input: string): KarpathyBlend | null {
	try {
		const parsed = JSON.parse(input) as Record<string, unknown>;
		const pr        = Number(parsed.pr);
		const attn      = Number(parsed.attn);
		const authority = Number(parsed.authority);
		const blend     = Number(parsed.blend);
		if (!Number.isFinite(pr) || !Number.isFinite(attn) || !Number.isFinite(authority) || !Number.isFinite(blend)) {
			return null;
		}
		return { pr, attn, authority, blend };
	} catch {
		return null;
	}
}
