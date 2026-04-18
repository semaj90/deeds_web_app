/**
 * QLoRA Quality Boost — Redis sorted set of chunk IDs that appear in
 * high-quality qlora_examples. Applied as a +0.05 score bump during
 * retrieval re-ranking so proven chunks surface more often.
 *
 * The set is rebuilt lazily with a 6-hour TTL.
 */

import { getRedis } from '$lib/server/redis.js';
import { pool } from '$lib/server/db/client';

const QLORA_BOOST_KEY = 'qlora:chunk-quality';
const QLORA_BOOST_TTL = 6 * 60 * 60; // 6 hours
const QLORA_BOOST_AMOUNT = 0.05;
const META_KEY = 'qlora:chunk-quality:built_at';

/**
 * Ensure the sorted set is populated. Lazy: only rebuilds if TTL expired.
 * Fire-and-forget safe — never throws.
 */
async function ensureBoostSet(): Promise<void> {
	try {
		const redis = getRedis();
		if (!redis) return;
		const exists = await redis.exists(META_KEY);
		if (exists) return; // still fresh

		// Pull chunk IDs + avg response_score from gold/silver qlora_examples
		const { rows } = await pool.query<{ chunk_id: string; score: number }>(
			`SELECT c->>'id' AS chunk_id, AVG(q.response_score) AS score
			 FROM qlora_examples q,
			      jsonb_array_elements(q.context_chunks) AS c
			 WHERE q.quality_tier IN ('gold', 'silver', 'platinum')
			   AND q.response_score IS NOT NULL
			   AND c->>'id' IS NOT NULL
			 GROUP BY c->>'id'
			 HAVING COUNT(*) >= 2`
		);

		if (!rows.length) return;

		const pipeline = redis.pipeline();
		pipeline.del(QLORA_BOOST_KEY);
		for (const r of rows) {
			pipeline.zadd(QLORA_BOOST_KEY, r.score, r.chunk_id);
		}
		pipeline.set(META_KEY, String(Date.now()), 'EX', QLORA_BOOST_TTL);
		pipeline.expire(QLORA_BOOST_KEY, QLORA_BOOST_TTL);
		await pipeline.exec();
		console.log(`[qlora-boost] Rebuilt sorted set with ${rows.length} chunk IDs`);
	} catch {
		// Non-fatal — boost is optional
	}
}

/**
 * Look up boost scores for a batch of chunk IDs.
 * Returns a Map from chunkId → boost amount (0 if not in set).
 */
export async function getQloraBoosts(
	chunkIds: string[]
): Promise<Map<string, number>> {
	const boosts = new Map<string, number>();
	if (!chunkIds.length) return boosts;

	try {
		await ensureBoostSet();
		const redis = getRedis();
		if (!redis) return boosts;

		const pipeline = redis.pipeline();
		for (const id of chunkIds) {
			pipeline.zscore(QLORA_BOOST_KEY, id);
		}
		const results = await pipeline.exec();
		if (!results) return boosts;

		for (let i = 0; i < chunkIds.length; i++) {
			const [err, score] = results[i] ?? [];
			if (!err && score != null) {
				boosts.set(chunkIds[i], QLORA_BOOST_AMOUNT);
			}
		}
	} catch {
		// Non-fatal
	}
	return boosts;
}

/**
 * Apply QLoRA quality boosts to an array of retrieval results in place.
 * Chunks that appear in high-quality training examples get +0.05 to their score.
 * Returns the number of chunks boosted.
 */
export async function applyQloraBoost(
	results: Array<{ id: string; score: number; explain?: { qloraBoost?: boolean } }>
): Promise<number> {
	if (!results.length) return 0;
	const boosts = await getQloraBoosts(results.map((r) => r.id));
	let boosted = 0;
	for (const r of results) {
		const boost = boosts.get(r.id);
		if (boost) {
			r.score = Math.min(r.score + boost, 1.0);
			if (r.explain) r.explain.qloraBoost = true;
			boosted++;
		}
	}
	return boosted;
}

/** Force rebuild of the boost set (e.g. after distillation run). */
export async function invalidateQloraBoostSet(): Promise<void> {
	try {
		const redis = getRedis();
		if (!redis) return;
		await redis.del(META_KEY, QLORA_BOOST_KEY);
	} catch {
		// Non-fatal
	}
}
