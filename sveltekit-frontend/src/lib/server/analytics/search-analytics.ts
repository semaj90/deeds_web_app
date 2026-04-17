/**
 * Search Analytics — hot-query ring buffer + Bifrost variance pairs + chunk hit recording.
 *
 * All writes are fire-and-forget (non-blocking). Never throws — analytics must
 * not interrupt the retrieval path.
 *
 * Data stores:
 *   Redis  — hot_queries sorted set (7-day rolling ZINCRBY)
 *           query_vecs hash (64-dim sketch + meta, 7-day TTL)
 *           variance_pairs hash (Bifrost L2 match pairs)
 *   Postgres — chunk_hit_log table (per-hit retrieval analytics)
 *              query_variance_pairs table (durable variant pairs)
 *              rag_query_log table (per-query stats)
 */
import { createHash } from 'crypto';
import { getRedis } from '$lib/server/redis.js';
import { pgRows } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

// ── Types ──────────────────────────────────────────────────────────────────

export type HitPipeline = 'ace' | 'kag' | 'dag' | 'rag' | 'reranker' | 'codebase';

export interface ChunkHit {
	id:           string;
	relativePath?: string;
	gpuCluster?:  number | null;
	somCluster?:  number | null;
	score:        number;
	rerankScore?: number;
}

export interface QueryLogEntry {
	query:             string;
	queryHash:         string;
	userId?:           string;
	caseId?:           string;
	totalFound?:       number;
	searchTimeMs?:     number;
	rerankTimeMs?:     number;
	rerankL0Hit?:      boolean;
	rerankL1Hits?:     number;
	rerankFreshScored?: number;
	topChunkId?:       string;
	topChunkScore?:    number;
	topRerankScore?:   number;
	dagEnabled?:       boolean;
	dagStatus?:        string;
	hybridSearch?:     boolean;
	entityStatutes?:   string[];
	entityCases?:      string[];
}

// ── Key helpers ─────────────────────────────────────────────────────────────

const HOT_QUERY_KEY   = 'analytics:hot_queries';    // sorted set: score = hit count
const QUERY_VEC_KEY   = 'analytics:query_vecs';     // hash: queryHash → JSON meta+sketch
const VARIANCE_KEY    = 'analytics:variance_pairs'; // hash: pairKey → JSON
const ROLLING_TTL     = 7 * 24 * 3600;              // 7-day rolling window

export function queryHash(query: string): string {
	return createHash('sha256').update(query.toLowerCase().trim()).digest('hex').slice(0, 16);
}

// ── Core analytics functions ─────────────────────────────────────────────────

/**
 * Record a search query into the Redis hot-query ring buffer.
 * Stores a 64-dim embedding sketch for approximate variance computation.
 * Fire-and-forget — never awaited by callers.
 */
export function recordSearchQuery(opts: {
	query:       string;
	embedding?:  number[];
	pipeline:    HitPipeline;
	cacheHit:    boolean;
	userId?:     string;
}): void {
	const hash = queryHash(opts.query);
	const redis = getRedis();
	const sketch = opts.embedding ? opts.embedding.slice(0, 64) : null;

	Promise.all([
		redis.zincrby(HOT_QUERY_KEY, 1, hash),
		redis.expire(HOT_QUERY_KEY, ROLLING_TTL),
		// Store meta only if not already present (hsetnx = set if not exists)
		redis.hsetnx(QUERY_VEC_KEY, hash, JSON.stringify({
			query:     opts.query.slice(0, 200),
			sketch,    // 64-dim for fast dot-product variance check
			pipeline:  opts.pipeline,
			cacheHit:  opts.cacheHit,
			firstSeen: new Date().toISOString(),
		})),
		redis.expire(QUERY_VEC_KEY, ROLLING_TTL),
	]).catch(() => {});
}

/**
 * Record a chunk_hit_log row for every retrieved chunk.
 * Called once per pipeline pass (ACE, KAG, DAG, RAG, reranker, codebase).
 * Fire-and-forget.
 */
export function recordChunkHits(
	hits:     ChunkHit[],
	query:    string,
	pipeline: HitPipeline,
	opts:     { userId?: string; caseId?: string } = {}
): void {
	if (!hits.length) return;
	const qHash = queryHash(query);

	pgRows<{ id: number }>(
		`INSERT INTO chunk_hit_log
		   (chunk_id, relative_path, gpu_cluster, som_cluster, pipeline, query_hash,
		    score, rerank_score, user_id, case_id)
		 SELECT t.chunk_id, t.relative_path, t.gpu_cluster::int, t.som_cluster::int,
		        t.pipeline, t.query_hash, t.score::real, t.rerank_score::real,
		        t.user_id::uuid, t.case_id::uuid
		 FROM jsonb_to_recordset($1::jsonb) AS t(
		   chunk_id text, relative_path text, gpu_cluster text, som_cluster text,
		   pipeline text, query_hash text, score text, rerank_score text,
		   user_id text, case_id text
		 )`,
		[JSON.stringify(hits.map((h) => ({
			chunk_id:      h.id,
			relative_path: h.relativePath ?? '',
			gpu_cluster:   h.gpuCluster != null ? String(h.gpuCluster) : null,
			som_cluster:   h.somCluster  != null ? String(h.somCluster)  : null,
			pipeline,
			query_hash:    qHash,
			score:         String(h.score),
			rerank_score:  h.rerankScore != null ? String(h.rerankScore) : null,
			user_id:       opts.userId ?? null,
			case_id:       opts.caseId ?? null,
		})))]
	).catch(() => {});
}

/**
 * Persist a full query log entry to rag_query_log.
 * Fire-and-forget. Embedding is stored async separately.
 */
export function recordQueryLog(entry: QueryLogEntry): void {
	pgRows(
		`INSERT INTO rag_query_log
		   (user_id, case_id, query, query_hash, total_found, search_time_ms, rerank_time_ms,
		    rerank_l0_hit, rerank_l1_hits, rerank_fresh_scored,
		    top_chunk_id, top_chunk_score, top_rerank_score,
		    dag_enabled, dag_status, hybrid_search,
		    entity_statutes, entity_cases)
		 VALUES
		   ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
		    $14, $15, $16, $17::jsonb, $18::jsonb)`,
		[
			entry.userId ?? null,
			entry.caseId ?? null,
			entry.query,
			entry.queryHash,
			entry.totalFound ?? 0,
			entry.searchTimeMs ?? null,
			entry.rerankTimeMs ?? null,
			entry.rerankL0Hit ?? false,
			entry.rerankL1Hits ?? 0,
			entry.rerankFreshScored ?? 0,
			entry.topChunkId ?? null,
			entry.topChunkScore ?? null,
			entry.topRerankScore ?? null,
			entry.dagEnabled ?? true,
			entry.dagStatus ?? null,
			entry.hybridSearch ?? false,
			JSON.stringify(entry.entityStatutes ?? []),
			JSON.stringify(entry.entityCases ?? []),
		]
	).catch(() => {});
}

/**
 * Record a Bifrost L2 cache variance pair (matched query A ↔ cached query B).
 * Upserts on the canonical pair key (sorted hashes), incrementing hit_count.
 */
export function recordVariancePair(opts: {
	queryA:     string;
	queryB:     string;
	similarity: number;
	pipeline?:  string;
}): void {
	const hashA = queryHash(opts.queryA);
	const hashB = queryHash(opts.queryB);

	pgRows(
		`INSERT INTO query_variance_pairs
		   (query_hash_a, query_hash_b, query_a, query_b, similarity, pipeline)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (LEAST(query_hash_a, query_hash_b), GREATEST(query_hash_a, query_hash_b))
		 DO UPDATE SET hit_count = query_variance_pairs.hit_count + 1,
		               last_seen = NOW()`,
		[hashA, hashB, opts.queryA.slice(0, 300), opts.queryB.slice(0, 300),
		 opts.similarity, opts.pipeline ?? null]
	).catch(() => {});

	// Also in Redis for fast in-process reads (query expander)
	const redis  = getRedis();
	const pairKey = [hashA, hashB].sort().join(':');
	redis.hincrby('analytics:variance_pairs', pairKey, 1).catch(() => {});
}

// ── Read-side helpers ─────────────────────────────────────────────────────────

export interface HotQuery { query: string; hits: number; hash: string; }

/** Top-N most-searched queries from the 7-day rolling Redis sorted set. */
export async function getHotQueries(topN = 20): Promise<HotQuery[]> {
	try {
		const redis   = getRedis();
		const entries = await redis.zrevrange(HOT_QUERY_KEY, 0, topN - 1, 'WITHSCORES');
		const results: HotQuery[] = [];
		for (let i = 0; i < entries.length; i += 2) {
			const hash  = entries[i];
			const hits  = Number(entries[i + 1]);
			const meta  = await redis.hget(QUERY_VEC_KEY, hash);
			if (meta) {
				const { query } = JSON.parse(meta) as { query: string };
				results.push({ query, hits, hash });
			}
		}
		return results;
	} catch { return []; }
}

/** Cluster heat: which GPU clusters are hit most in the last N days. */
export async function getClusterHeatMap(days = 7): Promise<
	Array<{ gpu_cluster: number; total_hits: number; unique_queries: number; avg_rerank: number | null }>
> {
	try {
		return await pgRows<{
			gpu_cluster: number;
			total_hits: number;
			unique_queries: number;
			avg_rerank: number | null;
		}>(
			`SELECT gpu_cluster,
			        COUNT(*)::int                 AS total_hits,
			        COUNT(DISTINCT query_hash)::int AS unique_queries,
			        AVG(rerank_score)::real       AS avg_rerank
			 FROM   chunk_hit_log
			 WHERE  hit_at > NOW() - ($1 || ' days')::interval
			   AND  gpu_cluster IS NOT NULL
			 GROUP  BY gpu_cluster
			 ORDER  BY total_hits DESC`,
			[String(days)]
		);
	} catch { return []; }
}

/** Retrieve all stored 64-dim sketches for variance computation (capped at 500). */
export async function getAllQuerySketches(): Promise<
	Array<{ hash: string; query: string; sketch: number[] | null }>
> {
	try {
		const redis  = getRedis();
		const hashes = await redis.hkeys(QUERY_VEC_KEY);
		const cap    = hashes.slice(0, 500);
		const vals   = cap.length > 0 ? await redis.hmget(QUERY_VEC_KEY, ...cap) : [];
		return cap.map((hash, i) => {
			const raw = vals[i];
			if (!raw) return { hash, query: '', sketch: null };
			const { query, sketch } = JSON.parse(raw) as { query: string; sketch: number[] | null };
			return { hash, query, sketch };
		});
	} catch { return []; }
}
