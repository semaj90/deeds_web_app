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
 *           qlora_sketch:<hash> → 64-dim sketch from qlora gold examples (1hr TTL)
 *   Postgres — chunk_hit_log table (per-hit retrieval analytics)
 *              query_variance_pairs table (durable variant pairs)
 *              rag_query_log table (per-query stats)
 *              qlora_examples table (gold/silver/bronze training examples)
 */
import { createHash } from 'crypto';
import { getRedis } from '$lib/server/redis.js';
import { pool } from '$lib/server/db/client';
import { batchCosineSimilarity } from '$lib/server/gpu/libtorch-bridge.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type HitPipeline =
  | 'ace'
  | 'kag'
  | 'dag'
  | 'rag'
  | 'reranker'
  | 'reranker+qlora'
  | 'codebase';

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

	pool
    .query(
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
      [
        JSON.stringify(
          hits.map((h) => ({
            chunk_id: h.id,
            relative_path: h.relativePath ?? '',
            gpu_cluster: h.gpuCluster != null ? String(h.gpuCluster) : null,
            som_cluster: h.somCluster != null ? String(h.somCluster) : null,
            pipeline,
            query_hash: qHash,
            score: String(h.score),
            rerank_score: h.rerankScore != null ? String(h.rerankScore) : null,
            user_id: opts.userId ?? null,
            case_id: opts.caseId ?? null,
          }))
        ),
      ]
    )
    .catch(() => {});
}

/**
 * Persist a full query log entry to rag_query_log.
 * Fire-and-forget. Embedding is stored async separately.
 */
export function recordQueryLog(entry: QueryLogEntry): void {
	pool
    .query(
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
    )
    .catch(() => {});
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

	pool
    .query(
      `INSERT INTO query_variance_pairs
		   (query_hash_a, query_hash_b, query_a, query_b, similarity, pipeline)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (LEAST(query_hash_a, query_hash_b), GREATEST(query_hash_a, query_hash_b))
		 DO UPDATE SET hit_count = query_variance_pairs.hit_count + 1,
		               last_seen = NOW()`,
      [
        hashA,
        hashB,
        opts.queryA.slice(0, 300),
        opts.queryB.slice(0, 300),
        opts.similarity,
        opts.pipeline ?? null,
      ]
    )
    .catch(() => {});

	// Also in Redis for fast in-process reads (query expander)
	const redis  = getRedis();
	const pairKey = [hashA, hashB].sort().join(':');
	redis.hincrby(VARIANCE_KEY, pairKey, 1).catch(() => {});
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
		const r = await pool.query<{
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
		return r.rows;
	} catch { return []; }
}

/**
 * Retrieval quality signal: per-chunk hit frequency × avg rerank score.
 * Used for: promotion of proven chunks in future ACE retrieval, QLoRA curriculum weighting.
 *
 * Returns the top N chunks by quality score (hit_count × avg_rerank).
 * Chunks with no rerank_score fall back to raw score.
 */
export async function getChunkQualitySignals(
	limit = 20,
	days = 7
): Promise<
	Array<{
		chunk_id:       string;
		relative_path:  string | null;
		hit_count:      number;
		avg_rerank:     number | null;
		unique_queries: number;
		pipelines:      string[];
		quality_score:  number;
	}>
> {
	try {
		const res = await pool.query<{
			chunk_id:       string;
			relative_path:  string | null;
			hit_count:      number;
			avg_rerank:     number | null;
			unique_queries: number;
			pipelines:      string;
			quality_score:  number;
		}>(
			`SELECT chunk_id,
			        MAX(relative_path)                       AS relative_path,
			        COUNT(*)::int                            AS hit_count,
			        AVG(COALESCE(rerank_score, score))::real AS avg_rerank,
			        COUNT(DISTINCT query_hash)::int          AS unique_queries,
			        string_agg(DISTINCT pipeline, ',')       AS pipelines,
			        (COUNT(*) * AVG(COALESCE(rerank_score, score)))::real AS quality_score
			 FROM   chunk_hit_log
			 WHERE  hit_at > NOW() - ($1 || ' days')::interval
			 GROUP  BY chunk_id
			 ORDER  BY quality_score DESC
			 LIMIT  $2`,
			[String(days), String(limit)]
		);
		return res.rows.map((r) => ({
			...r,
			pipelines: r.pipelines ? r.pipelines.split(',') : [],
		}));
	} catch { return []; }
}

/**
 * Fetch variance pairs from Postgres filtered by a similarity threshold.
 *
 * `temperature` maps [0, 1] → minSimilarity [1.0, 0.5]:
 *   temperature=0   → only near-exact pairs   (sim ≥ 1.0)
 *   temperature=0.5 → Bifrost default region  (sim ≥ 0.75)
 *   temperature=1.0 → broad fuzzy matches     (sim ≥ 0.50)
 */
export async function getVariancePairs(opts: {
	temperature?: number;  // 0–1
	limit?:       number;
	days?:        number;
}): Promise<Array<{ query_a: string; query_b: string; similarity: number; hit_count: number }>> {
	const temp      = Math.max(0, Math.min(1, opts.temperature ?? 0.5));
	const minSim    = 1.0 - temp * 0.5;          // [0.5, 1.0]
	const limit     = Math.min(opts.limit ?? 20, 100);
	const days      = opts.days ?? 30;

	try {
		const r = await pool.query<{
			query_a:   string;
			query_b:   string;
			similarity: number;
			hit_count:  number;
		}>(
			`SELECT query_a, query_b, similarity, hit_count
			 FROM   query_variance_pairs
			 WHERE  similarity >= $1
			   AND  last_seen  >  NOW() - ($2 || ' days')::interval
			 ORDER  BY hit_count DESC, similarity DESC
			 LIMIT  $3`,
			[minSim, String(days), String(limit)]
		);
		return r.rows;
	} catch { return []; }
}

/**
 * "Did you mean?" suggestions for a query string.
 *
 * Strategy (cheapest first, results merged and re-ranked):
 *   1. Redis variance ring  — 0ms   — exact-hash pair lookup
 *   2. Postgres pg_trgm     — ~5ms  — trigram similarity on query_variance_pairs
 *   3. QLoRA oracle         — ~15ms — cosine similarity on gold/silver training examples
 *                                     with 64-dim embedding sketches (GPU-accelerated)
 *
 * Tier 3 is the "smart" tier: suggestions come from queries that produced
 * high-quality LLM responses. Gold-tier = confirmed great answers.
 *
 * `temperature` controls how loose the match must be (same scale as getVariancePairs).
 * Returns suggestions ranked by blended similarity × quality signal.
 */
export async function getDidYouMeanSuggestions(
	query:       string,
	temperature  = 0.5,
	limit        = 5
): Promise<Array<{
	suggestion:   string;
	similarity:   number;
	hitCount:     number;
	source:       'redis' | 'pg' | 'qlora';
	qualityTier?: string;
}>> {
	const temp   = Math.max(0, Math.min(1, temperature));
	const minSim = 1.0 - temp * 0.5;
	const hash   = queryHash(query);
	const results: Array<{
		suggestion:   string;
		similarity:   number;
		hitCount:     number;
		source:       'redis' | 'pg' | 'qlora';
		qualityTier?: string;
	}> = [];

	// ── 1. Redis fast-path: check variance_pairs ring for this query's hash ──
	try {
		const redis   = getRedis();
		const pairKey = hash;
		const allKeys = await redis.hkeys(VARIANCE_KEY);
		const matched = allKeys.filter((k) => k.startsWith(pairKey + ':') || k.endsWith(':' + pairKey));

		if (matched.length > 0) {
			const vals = await redis.hmget(VARIANCE_KEY, ...matched);
			for (let i = 0; i < matched.length; i++) {
				const raw = vals[i];
				if (!raw) continue;
				const count = Number(raw);
				if (!isFinite(count)) continue;
				results.push({ suggestion: '', similarity: 0.8, hitCount: count, source: 'redis' });
			}
		}
	} catch { /* non-fatal */ }

	// ── 2. Postgres pg_trgm similarity scan ──────────────────────────────────
	try {
		const r = await pool.query<{
			suggestion: string;
			similarity: number;
			hit_count:  number;
		}>(
			`SELECT CASE
			          WHEN similarity($1, query_a) >= similarity($1, query_b) THEN query_b
			          ELSE query_a
			        END                                          AS suggestion,
			        GREATEST(similarity($1, query_a),
			                 similarity($1, query_b))::real     AS similarity,
			        hit_count
			 FROM   query_variance_pairs
			 WHERE  GREATEST(similarity($1, query_a),
			                 similarity($1, query_b)) >= $2
			 ORDER  BY (hit_count * GREATEST(similarity($1, query_a),
			                                similarity($1, query_b))) DESC
			 LIMIT  $3`,
			[query.slice(0, 300), minSim, String(limit * 2)]
		);

		for (const row of r.rows) {
			if (row.suggestion && row.suggestion.toLowerCase() !== query.toLowerCase()) {
				results.push({
					suggestion: row.suggestion,
					similarity: row.similarity,
					hitCount:   row.hit_count,
					source:     'pg',
				});
			}
		}
	} catch { /* pg_trgm may not be installed */ }

	// ── 3. QLoRA oracle — cosine similarity on gold/silver training examples ──
	// Run in parallel with above when we still need more candidates
	try {
		const qloraSuggestions = await getQloraSmartSuggestions(query, temperature, limit);
		for (const s of qloraSuggestions) {
			results.push({
				suggestion:  s.suggestion,
				similarity:  s.similarity,
				hitCount:    s.hitCount,
				source:      'qlora',
				qualityTier: s.qualityTier,
			});
		}
	} catch { /* non-fatal */ }

	// Deduplicate, rank by similarity × hitCount, return top-N
	const seen = new Set<string>();
	return results
		.filter((r) => r.suggestion && !seen.has(r.suggestion) && seen.add(r.suggestion) !== undefined)
		.sort((a, b) => (b.similarity * b.hitCount) - (a.similarity * a.hitCount))
		.slice(0, limit);
}

// ── QLoRA-powered "did you mean" helpers ─────────────────────────────────────

const QLORA_SKETCH_TTL = 3600; // 1 hour

/**
 * Get a 64-dim sketch for a query string from:
 *   1. Redis cache (fast path)
 *   2. Ollama embeddinggemma (first 64 dims only)
 * Returns null if embedding unavailable (non-fatal).
 */
async function getQuerySketch(query: string): Promise<number[] | null> {
	const hash  = queryHash(query);
	const redis = getRedis();
	const key   = `qlora_sketch:${hash}`;

	// Redis cache
	try {
		const cached = await redis.get(key);
		if (cached) return JSON.parse(cached) as number[];
	} catch { /* non-fatal */ }

	// Generate via Ollama
	try {
		const ollamaUrl = process.env.OLLAMA_URL ?? 'http://localhost:11434';
		const res = await fetch(`${ollamaUrl}/api/embeddings`, {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify({ model: process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest', prompt: query }),
			signal:  AbortSignal.timeout(4_000),
		});
		if (!res.ok) return null;
		const data = await res.json() as { embedding?: number[] };
		const sketch = (data.embedding ?? []).slice(0, 64);
		if (sketch.length === 0) return null;

		// Cache it
		redis.set(key, JSON.stringify(sketch), 'EX', QLORA_SKETCH_TTL).catch(() => {});
		return sketch;
	} catch { return null; }
}

/**
 * QLoRA-backed "did you mean" — Tier 3.
 *
 * Queries qlora_examples (gold/silver quality tier) via pg_trgm for text candidates,
 * then reranks them with cosine similarity on 64-dim embedding sketches using the
 * libtorch GPU bridge (auto-falls back to CPU dot-product).
 *
 * Returns suggestions only from examples where real users got high-quality responses,
 * weighted by quality_tier: gold=1.0, silver=0.8, bronze=0.5.
 */
export async function getQloraSmartSuggestions(
	query:       string,
	temperature  = 0.5,
	limit        = 5
): Promise<Array<{
	suggestion:   string;
	similarity:   number;
	hitCount:     number;
	qualityTier:  string;
	source:       'qlora';
}>> {
	const temp      = Math.max(0, Math.min(1, temperature));
	const minTrgm   = Math.max(0.1, 0.3 - temp * 0.2);   // 0.1–0.3 depending on temperature
	const tierWeight = { gold: 1.0, silver: 0.8, bronze: 0.5 } as Record<string, number>;

	// ── Step 1: pg_trgm candidates from high-quality qlora_examples ───────────
	let candidates: Array<{ instruction: string; quality_tier: string; response_score: number }> = [];
	try {
		const r = await pool.query<{
			instruction:    string;
			quality_tier:   string;
			response_score: number;
		}>(
			`SELECT instruction, quality_tier, avg_rerank_score::real AS response_score
			 FROM   qlora_examples
			 WHERE  quality_tier IN ('gold', 'silver')
			   AND  similarity($1, instruction) >= $2
			   AND  LOWER(instruction) <> LOWER($1)
			 ORDER  BY (similarity($1, instruction) * avg_rerank_score) DESC
			 LIMIT  $3`,
			[query.slice(0, 300), minTrgm, String(limit * 4)]
		);
		candidates = r.rows;
	} catch { return []; } // pg_trgm not available

	if (candidates.length === 0) return [];

	// ── Step 2: cosine rerank via 64-dim embedding sketches ───────────────────
	const [querySketch, ...candidateSketches] = await Promise.all([
		getQuerySketch(query),
		...candidates.map((c) => getQuerySketch(c.instruction)),
	]);

	let cosScores: number[] | null = null;
	if (querySketch && candidateSketches.every((s) => s !== null)) {
		try {
			const result = await batchCosineSimilarity(querySketch, candidateSketches as number[][]);
			cosScores = result.scores;
		} catch { /* non-fatal — fall through to trgm-only */ }
	}

	// ── Step 3: merge scores ───────────────────────────────────────────────────
	return candidates
		.map((c, i) => {
			const cosSim    = cosScores ? (cosScores[i] ?? 0) : 0.5;
			const tWeight   = tierWeight[c.quality_tier] ?? 0.5;
			const blended   = cosSim * 0.7 + (c.response_score ?? 0.5) * 0.2 + tWeight * 0.1;
			return {
				suggestion:  c.instruction,
				similarity:  parseFloat(blended.toFixed(4)),
				hitCount:    Math.round(tWeight * 10),  // proxy: gold=10, silver=8, bronze=5
				qualityTier: c.quality_tier,
				source:      'qlora' as const,
			};
		})
		.sort((a, b) => b.similarity - a.similarity)
		.slice(0, limit);
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
