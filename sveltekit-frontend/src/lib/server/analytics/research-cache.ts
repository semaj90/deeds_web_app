/**
 * Research Cache — Redis-indexed QLoRA JSONL query layer.
 *
 * Indexes qlora_examples (joined with response_feedback) into Redis sorted sets
 * for fast pipeline-aware topic retrieval without repeated DB scans.
 *
 * Key schema:
 *   research:idx:{pipeline}       ZSET   queryHash → composite score
 *   research:sketch:{queryHash}   STRING JSON { query, qualityTier, entityTags, feedbackUp,
 *                                              feedbackDown, graphSummary, pipelines }
 *   research:topics:chain:{hash}  STRING JSON string[] self-prompt chain (2hr TTL)
 *   research:built_at             STRING ISO timestamp
 *
 * Score formula:
 *   quality_weight × (1 + feedback_ratio) × (response_score ?? 0.5)
 *   where quality_weight: platinum=4 gold=3 silver=2 bronze=1
 *         feedback_ratio: up / (up + down + 1)
 */

import { getRedis } from '$lib/server/redis.js';
import { pool } from '$lib/server/db/client';

// ── Constants ──────────────────────────────────────────────────────────────────

const CACHE_TTL_S   = 30 * 60;        // 30 minutes
const CHAIN_TTL_S   = 2 * 60 * 60;    // 2 hours
const BUILT_AT_KEY  = 'research:built_at';
const PIPELINE_KEY  = (p: string) => `research:idx:${p}`;
const SKETCH_KEY    = (h: string) => `research:sketch:${h}`;

export const PIPELINES = ['ace', 'rag', 'kag', 'dag', 'codebase', 'reranker'] as const;
export type ResearchPipeline = (typeof PIPELINES)[number] | 'all';

export interface ResearchSketch {
	queryHash:    string;
	query:        string;
	qualityTier:  string | null;
	entityTags:   string[];
	pipelines:    string[];
	graphSummary: string | null;
	feedbackUp:   number;
	feedbackDown: number;
	feedbackRatio: number;
	responseScore: number;
	compositeScore: number;
}

// ── Quality weights ────────────────────────────────────────────────────────────

const QUALITY_WEIGHT: Record<string, number> = {
	platinum: 4.0,
	gold:     3.0,
	silver:   2.0,
	bronze:   1.0,
};

function qualityWeight(tier: string | null): number {
	return tier ? (QUALITY_WEIGHT[tier.toLowerCase()] ?? 1.0) : 1.0;
}

function compositeScore(
	tier: string | null,
	responseScore: number | null,
	feedbackUp: number,
	feedbackDown: number
): number {
	const qw   = qualityWeight(tier);
	const rs   = responseScore ?? 0.5;
	const fr   = feedbackUp / (feedbackUp + feedbackDown + 1);
	return qw * (1 + fr) * rs;
}

// ── Build index ────────────────────────────────────────────────────────────────

/**
 * Scan qlora_examples joined with response_feedback and populate Redis sorted sets.
 * Safe to call concurrently — last writer wins (atomic ZADD + SET).
 */
export async function buildResearchIndex(): Promise<{
	indexed: number;
	durationMs: number;
}> {
	const start = Date.now();

	// One query: qlora_examples + aggregated feedback counts per query_hash
	const { rows } = await pool.query<{
		query_hash:     string;
		query:          string | null;
		quality_tier:   string | null;
		entity_tags:    string;        // jsonb as text
		pipeline_hits:  string;        // jsonb as text
		graph_summary:  string | null;
		response_score: number | null;
		feedback_up:    string;
		feedback_down:  string;
	}>(`
		SELECT
			q.query_hash,
			q.query,
			q.quality_tier,
			q.entity_tags::text,
			q.pipeline_hits::text,
			q.graph_summary,
			q.response_score,
			COALESCE(fb.up,   0) AS feedback_up,
			COALESCE(fb.down, 0) AS feedback_down
		FROM qlora_examples q
		LEFT JOIN (
			SELECT
				query_hash,
				COUNT(*) FILTER (WHERE rating = 'up')   AS up,
				COUNT(*) FILTER (WHERE rating = 'down') AS down
			FROM response_feedback
			GROUP BY query_hash
		) fb ON fb.query_hash = q.query_hash
		WHERE q.response_score IS NOT NULL OR q.quality_tier IS NOT NULL
		ORDER BY q.created_at DESC
		LIMIT 2000
	`);

	if (!rows.length) return { indexed: 0, durationMs: Date.now() - start };

	const redis = getRedis();
	const pipeline = redis.pipeline();

	for (const row of rows) {
		const up   = Number(row.feedback_up);
		const down = Number(row.feedback_down);
		const score = compositeScore(row.quality_tier, row.response_score, up, down);

		// Deserialise jsonb columns
		let entityTags: string[] = [];
		let pipelineHits: Record<string, number> = {};
		try { entityTags = JSON.parse(row.entity_tags ?? '[]'); } catch { /* */ }
		try { pipelineHits = JSON.parse(row.pipeline_hits ?? '{}'); } catch { /* */ }
		const pipelines = Object.keys(pipelineHits).filter(k => pipelineHits[k] > 0);

		const sketch: ResearchSketch = {
			queryHash:     row.query_hash,
			query:         row.query ?? '',
			qualityTier:   row.quality_tier,
			entityTags,
			pipelines:     pipelines.length ? pipelines : ['rag'],
			graphSummary:  row.graph_summary,
			feedbackUp:    up,
			feedbackDown:  down,
			feedbackRatio: up / (up + down + 1),
			responseScore: row.response_score ?? 0.5,
			compositeScore: score,
		};

		// Store sketch
		pipeline.set(SKETCH_KEY(row.query_hash), JSON.stringify(sketch), 'EX', CACHE_TTL_S);

		// Add to per-pipeline sorted sets
		const effectivePipelines = pipelines.length ? pipelines : ['rag'];
		for (const pl of effectivePipelines) {
			pipeline.zadd(PIPELINE_KEY(pl), score, row.query_hash);
			pipeline.expire(PIPELINE_KEY(pl), CACHE_TTL_S);
		}
		// Also add to global 'all' set
		pipeline.zadd(PIPELINE_KEY('all'), score, row.query_hash);
	}

	pipeline.expire(PIPELINE_KEY('all'), CACHE_TTL_S);
	pipeline.set(BUILT_AT_KEY, new Date().toISOString(), 'EX', CACHE_TTL_S);

	await pipeline.exec();

	return { indexed: rows.length, durationMs: Date.now() - start };
}

// ── Query index ────────────────────────────────────────────────────────────────

/**
 * Return top-N sketches for a pipeline, highest composite score first.
 * Rebuilds the index automatically if stale.
 */
export async function queryResearchIndex(
	pipeline: ResearchPipeline = 'all',
	limit = 20,
	minScore = 0
): Promise<ResearchSketch[]> {
	const redis = getRedis();

	// Check freshness
	const builtAt = await redis.get(BUILT_AT_KEY).catch(() => null);
	if (!builtAt) {
		await buildResearchIndex();
	}

	// ZREVRANGEBYSCORE for top-N by composite score
	const hashes = await redis
		.zrevrangebyscore(PIPELINE_KEY(pipeline), '+inf', minScore, 'LIMIT', 0, limit)
		.catch(() => [] as string[]);

	if (!hashes.length) return [];

	// Fetch sketches in one round-trip (MGET)
	const raw = await redis.mget(hashes.map(h => SKETCH_KEY(h))).catch(() => [] as (string | null)[]);

	// simdjson AVX2 fast-parse for ≥10/≥5KB aggregate. Research sketches carry
	// citations, entity tags, and summary text — typical sketch is 3-15KB.
	const totalChars = raw.reduce((sum, r) => sum + (r?.length ?? 0), 0);
	let parseFn: (s: string) => ResearchSketch = (s) => JSON.parse(s) as ResearchSketch;
	if (raw.length >= 10 && totalChars >= 5_000) {
		try {
			const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
			if (isSimdJsonAvailable()) parseFn = fastJsonParse<ResearchSketch>;
		} catch { /* addon unavailable — keep V8 */ }
	}

	const sketches: ResearchSketch[] = [];
	for (const r of raw) {
		if (!r) continue;
		try { sketches.push(parseFn(r)); } catch { /* */ }
	}
	return sketches;
}

// ── Self-prompt chain cache ────────────────────────────────────────────────────

/**
 * Cache a self-prompt chain for a query hash (generated by Ollama in the endpoint).
 */
export async function cachePromptChain(queryHash: string, chain: string[]): Promise<void> {
	const redis = getRedis();
	await redis
		.set(`research:topics:chain:${queryHash}`, JSON.stringify(chain), 'EX', CHAIN_TTL_S)
		.catch(() => {});
}

export async function getCachedPromptChain(queryHash: string): Promise<string[] | null> {
	const redis = getRedis();
	const raw = await redis.get(`research:topics:chain:${queryHash}`).catch(() => null);
	if (!raw) return null;
	try { return JSON.parse(raw) as string[]; } catch { return null; }
}

// ── Meta stats ─────────────────────────────────────────────────────────────────

export async function getResearchIndexStats(): Promise<{
	builtAt:        string | null;
	totalByPipeline: Record<string, number>;
}> {
	const redis = getRedis();
	const [builtAt, ...counts] = await Promise.all([
		redis.get(BUILT_AT_KEY).catch(() => null),
		...PIPELINES.map(p => redis.zcard(PIPELINE_KEY(p)).catch(() => 0)),
	]);

	const totalByPipeline: Record<string, number> = {};
	PIPELINES.forEach((p, i) => { totalByPipeline[p] = Number(counts[i]); });

	return { builtAt, totalByPipeline };
}

/**
 * Force-rebuild the index (e.g., after new qlora examples are distilled).
 */
export async function invalidateResearchIndex(): Promise<void> {
	const redis = getRedis();
	const keys = await redis.keys('research:*').catch(() => [] as string[]);
	if (keys.length) await redis.del(...keys).catch(() => {});
}
