/**
 * POST /api/analytics/feedback
 *
 * Records thumbs-up / thumbs-down on a search response.
 * Drives QLoRA quality tier upgrades, distillation skips, and chunk
 * quality re-weighting.
 *
 * Body: { queryHash, rating: 'up' | 'down' | null, pipeline?, chunkIds? }
 *   rating=null  → clear previous vote
 *   rating='up'  → high quality — promote in QLoRA training pipeline
 *   rating='down'→ low quality  — mark skip for distillation; demote tier
 *
 * GET /api/analytics/feedback?hash=<queryHash>
 *   Returns { up, down, userRating } for a single hash.
 *
 * GET /api/analytics/feedback?hashes=h1,h2,...
 *   Batch lookup — returns { [hash]: { up, down } }
 *
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { pool } from '$lib/server/db/client';
import { getRedis } from '$lib/server/redis.js';

// ── Schema ─────────────────────────────────────────────────────────────────

const postSchema = z.object({
	queryHash:     z.string().min(1).max(64),
	rating:        z.enum(['up', 'down']).nullable(),
	pipeline:      z.string().max(32).optional(),
	chunkIds:      z.array(z.string()).max(20).optional(),
	/** 8-char FNV-1a hash of the active hyperedge at signal time (from selectAdaptiveMemory) */
	hyperedgeHash: z.string().max(8).optional(),
});

// ── Redis keys ─────────────────────────────────────────────────────────────

const ratingKey  = (hash: string) => `feedback:rating:${hash}`;   // hash → {up,down} counts
const skipKey    = (hash: string) => `qlora:skip:${hash}`;         // present → skip distillation
const promoteKey = (hash: string) => `qlora:promote:${hash}`;      // present → promote in distillation

// ── Table bootstrap (idempotent) ───────────────────────────────────────────

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS response_feedback (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash  TEXT        NOT NULL,
  user_id     UUID,
  rating      TEXT        NOT NULL CHECK (rating IN ('up', 'down')),
  pipeline    TEXT,
  chunk_ids   TEXT[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (query_hash, user_id)
);
CREATE INDEX IF NOT EXISTS response_feedback_hash_idx ON response_feedback (query_hash);
CREATE INDEX IF NOT EXISTS response_feedback_user_idx ON response_feedback (user_id);
`;

let _bootstrapped = false;
async function ensureTable(): Promise<void> {
	if (_bootstrapped) return;
	await pool.query(BOOTSTRAP_SQL).catch(() => {});
	_bootstrapped = true;
}

// ── POST ──────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const body   = await request.json().catch(() => ({}));
	const parsed = postSchema.safeParse(body);
	if (!parsed.success) return json({ error: 'Invalid request' }, { status: 400 });

	const { queryHash, rating, pipeline, chunkIds = [], hyperedgeHash } = parsed.data;
	const userId = locals.user.id as string;
	const redis  = getRedis();

	await ensureTable();

	// ── 1. Persist vote (upsert per user + hash) ──────────────────────────
	if (rating === null) {
		// Clear vote
		await pool.query(
			`DELETE FROM response_feedback WHERE query_hash = $1 AND user_id = $2::uuid`,
			[queryHash, userId]
		).catch(() => {});
		// Remove Redis signals
		redis.del(skipKey(queryHash)).catch(() => {});
		redis.del(promoteKey(queryHash)).catch(() => {});
	} else {
		await pool.query(
			`INSERT INTO response_feedback (query_hash, user_id, rating, pipeline, chunk_ids)
			 VALUES ($1, $2::uuid, $3, $4, $5)
			 ON CONFLICT (query_hash, user_id)
			 DO UPDATE SET rating = EXCLUDED.rating,
			               pipeline = EXCLUDED.pipeline,
			               chunk_ids = EXCLUDED.chunk_ids,
			               created_at = NOW()`,
			[queryHash, userId, rating, pipeline ?? null, chunkIds.length ? chunkIds : null]
		).catch(() => {});
	}

	// ── 2. Aggregate counts from DB ───────────────────────────────────────
	const countResult = await pool.query<{ up: number; down: number }>(
		`SELECT
		   COUNT(*) FILTER (WHERE rating = 'up')::int   AS up,
		   COUNT(*) FILTER (WHERE rating = 'down')::int AS down
		 FROM response_feedback
		 WHERE query_hash = $1`,
		[queryHash]
	).catch(() => ({ rows: [{ up: 0, down: 0 }] }));

	const counts = countResult.rows[0] ?? { up: 0, down: 0 };

	// ── 3. Update Redis rating cache (fast reads) ────────────────────────
	redis.set(ratingKey(queryHash), JSON.stringify(counts), 'EX', 3600).catch(() => {});

	// ── 4. QLoRA quality signals ─────────────────────────────────────────
	if (rating === 'up') {
		// Mark for promotion in next distillation pass
		redis.set(promoteKey(queryHash), '1', 'EX', 86400).catch(() => {});
		redis.del(skipKey(queryHash)).catch(() => {});

		// If already in qlora_examples and tier < gold → promote
		pool.query(
			`UPDATE qlora_examples
			 SET quality_tier = CASE
			       WHEN quality_tier = 'bronze' THEN 'silver'
			       WHEN quality_tier = 'silver' THEN 'gold'
			       ELSE quality_tier
			     END,
			     response_score = LEAST(response_score + 0.05, 1.0)
			 WHERE query_hash = $1
			   AND quality_tier != 'gold'`,
			[queryHash]
		).then(() => {
			// Invalidate caches so next retrieval and research-topics use updated scores
			import('$lib/server/retrieval/qlora-boost.js').then(({ invalidateQloraBoostSet }) => invalidateQloraBoostSet()).catch(() => {});
			import('$lib/server/analytics/research-cache.js').then(({ invalidateResearchIndex }) => invalidateResearchIndex()).catch(() => {});
		}).catch(() => {});

		// Boost chunk quality signals for this query's top chunks
		if (chunkIds.length > 0) {
			// Upsert synthetic hits with boosted rerank_score (1.0) to reinforce quality signals
			pool.query(
				`INSERT INTO chunk_hit_log
				   (chunk_id, pipeline, query_hash, score, rerank_score, user_id)
				 SELECT t, $2, $3, 0.9, 1.0, $4::uuid
				 FROM UNNEST($1::text[]) AS t
				 ON CONFLICT DO NOTHING`,
				[chunkIds, pipeline ?? 'feedback', queryHash, userId]
			).catch(() => {});
		}

	} else if (rating === 'down') {
		// Mark to skip in next distillation pass
		redis.set(skipKey(queryHash), '1', 'EX', 86400).catch(() => {});
		redis.del(promoteKey(queryHash)).catch(() => {});

		// Demote if in qlora_examples
		pool.query(
			`UPDATE qlora_examples
			 SET quality_tier = CASE
			       WHEN quality_tier = 'gold'   THEN 'silver'
			       WHEN quality_tier = 'silver' THEN 'bronze'
			       ELSE quality_tier
			     END,
			     response_score = GREATEST(response_score - 0.05, 0.0)
			 WHERE query_hash = $1`,
			[queryHash]
		).then(() => {
			import('$lib/server/retrieval/qlora-boost.js').then(({ invalidateQloraBoostSet }) => invalidateQloraBoostSet()).catch(() => {});
			import('$lib/server/analytics/research-cache.js').then(({ invalidateResearchIndex }) => invalidateResearchIndex()).catch(() => {});
		}).catch(() => {});
	}

	// ── 5. RL self-modification signal ───────────────────────────────────
	// Maps thumbs-up/down → rlpolicy:pipeline_weights delta + context_timeline row.
	// Fire-and-forget: never delays the HTTP response.
	if (rating !== null) {
		const rlSignal = rating === 'up' ? 'thumbs_up' as const : 'thumbs_down' as const;
		const rlPipeline = (pipeline ?? 'ace') as 'ace' | 'rag' | 'kag' | 'dag' | 'codebase';
		import('$lib/server/graph/hypergraph-4d.js')
			.then(({ adaptFromAnalytics }) =>
				adaptFromAnalytics({
					signal:        rlSignal,
					pipeline:      rlPipeline,
					hyperedgeHash: hyperedgeHash ?? undefined,
					userId,
					sessionId:     userId,
				})
			)
			.catch(() => {});
	}

	return json({ ok: true, counts, rating });
};

// ── GET ───────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const userId = locals.user.id as string;
	const redis  = getRedis();

	// Single hash
	const hash = url.searchParams.get('hash');
	if (hash) {
		// Try Redis cache first
		try {
			const cached = await redis.get(ratingKey(hash));
			if (cached) {
				const counts = JSON.parse(cached) as { up: number; down: number };
				const userRating = await pool.query<{ rating: string }>(
					`SELECT rating FROM response_feedback WHERE query_hash = $1 AND user_id = $2::uuid`,
					[hash, userId]
				).then((r) => (r.rows[0]?.rating ?? null) as 'up' | 'down' | null).catch(() => null);
				return json({ ...counts, userRating });
			}
		} catch { /* fall through */ }

		const r = await pool.query<{ up: number; down: number; user_rating: string | null }>(
			`SELECT
			   COUNT(*) FILTER (WHERE rating = 'up')::int   AS up,
			   COUNT(*) FILTER (WHERE rating = 'down')::int AS down,
			   MAX(CASE WHEN user_id = $2::uuid THEN rating END) AS user_rating
			 FROM response_feedback
			 WHERE query_hash = $1`,
			[hash, userId]
		).catch(() => ({ rows: [{ up: 0, down: 0, user_rating: null }] }));

		const row = r.rows[0] ?? { up: 0, down: 0, user_rating: null };
		redis.set(ratingKey(hash), JSON.stringify({ up: row.up, down: row.down }), 'EX', 3600).catch(() => {});

		return json({ up: row.up, down: row.down, userRating: row.user_rating });
	}

	// Batch hashes
	const hashes = (url.searchParams.get('hashes') ?? '').split(',').filter(Boolean).slice(0, 50);
	if (hashes.length === 0) return json({});

	const batchResult = await pool.query<{ query_hash: string; up: number; down: number }>(
		`SELECT query_hash,
		        COUNT(*) FILTER (WHERE rating = 'up')::int   AS up,
		        COUNT(*) FILTER (WHERE rating = 'down')::int AS down
		 FROM   response_feedback
		 WHERE  query_hash = ANY($1::text[])
		 GROUP  BY query_hash`,
		[hashes]
	).catch(() => ({ rows: [] as Array<{ query_hash: string; up: number; down: number }> }));

	const userRatings = await pool.query<{ query_hash: string; rating: string }>(
		`SELECT query_hash, rating
		 FROM   response_feedback
		 WHERE  query_hash = ANY($1::text[])
		   AND  user_id = $2::uuid`,
		[hashes, userId]
	).catch(() => ({ rows: [] as Array<{ query_hash: string; rating: string }> }));

	const userMap = new Map(userRatings.rows.map((r) => [r.query_hash, r.rating]));
	const result: Record<string, { up: number; down: number; userRating: string | null }> = {};

	for (const h of hashes) {
		result[h] = { up: 0, down: 0, userRating: null };
	}
	for (const r of batchResult.rows) {
		result[r.query_hash] = { up: r.up, down: r.down, userRating: userMap.get(r.query_hash) ?? null };
	}
	for (const [h, ur] of userMap) {
		if (result[h]) result[h].userRating = ur;
	}

	return json(result);
};
