/**
 * GET /api/analytics/search-patterns
 *
 * Enhanced Search Intelligence endpoint.
 *
 * Returns:
 *   hotQueries         — top queries by frequency (regex-filterable with ?q=)
 *   clusterHeat        — GPU/SOM cluster usage heatmap
 *   variancePairs      — semantically similar query pairs (temperature-gated)
 *   chunkQuality       — per-chunk hit_count × avg_rerank quality scores
 *   pipelineMemory     — KAG/DAG/RAG/ACE/codebase breakdown from chunk_hit_log
 *   crossPipelineChamps— chunks consistently retrieved across ≥2 pipelines (high signal)
 *   trendingQueries    — queries with highest growth rate (last 24h vs prior days)
 *   didYouMean         — fuzzy suggestion list for ?suggest= input query
 *   qloraStats         — QLoRA training example quality distribution
 *   meta               — effective params (minSimilarity, windowDays, etc.)
 *
 * Query params:
 *   days?        number  — rolling window in days (max 30, default 7)
 *   temperature? number  — similarity fuzziness 0–1 for variance pairs (default 0.5)
 *                          0 = near-exact (sim ≥ 1.0) | 0.5 = Bifrost default (≥ 0.75) | 1 = broad (≥ 0.5)
 *   q?           string  — regex or substring filter applied to hotQueries
 *   suggest?     string  — query string to run "did you mean" against
 *
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
	getHotQueries,
	getClusterHeatMap,
	getChunkQualitySignals,
	getVariancePairs,
	getDidYouMeanSuggestions,
} from '$lib/server/analytics/search-analytics.js';
import { pool } from '$lib/server/db/client';

// ── Query param schema ─────────────────────────────────────────────────────

const querySchema = z.object({
	days:        z.coerce.number().int().min(1).max(30).default(7),
	temperature: z.coerce.number().min(0).max(1).default(0.5),
	q:           z.string().max(200).default(''),
	suggest:     z.string().max(300).default(''),
});

// ── Typed row shapes for raw SQL ───────────────────────────────────────────

type QloraStatRow = {
	quality_tier: string;
	cnt:          number;
	avg_score:    number;
};

type PipelineMemoryRow = {
	pipeline:       string;
	total_hits:     number;
	unique_chunks:  number;
	unique_queries: number;
	avg_rerank:     number | null;
	top_chunk_id:   string | null;
	top_chunk_path: string | null;
};

type CrossPipelineChampRow = {
	chunk_id:       string;
	relative_path:  string | null;
	pipeline_count: number;
	pipelines:      string;
	total_hits:     number;
	avg_rerank:     number | null;
	quality_score:  number;
};

type TrendingQueryRow = {
	query_hash:    string;
	recent_hits:   number;
	prior_hits:    number;
	growth_rate:   number;
};

type CorpusStatRow = {
	corpus_type:       string;
	processing_status: string;
	cnt:               number;
};

// ── Handler ────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = querySchema.safeParse({
		days:        url.searchParams.get('days')        ?? undefined,
		temperature: url.searchParams.get('temperature') ?? undefined,
		q:           url.searchParams.get('q')           ?? undefined,
		suggest:     url.searchParams.get('suggest')     ?? undefined,
	});
	if (!parsed.success) return json({ error: 'Invalid query params', issues: parsed.error.issues }, { status: 400 });

	const { days, temperature, q: qFilter, suggest: suggestFor } = parsed.data;
	const minSim = +(1.0 - temperature * 0.5).toFixed(3);

	const [
		hotQueriesRaw,
		clusterHeat,
		variancePairs,
		qloraStats,
		chunkQuality,
		pipelineMemory,
		crossPipelineChamps,
		trendingQueries,
		didYouMean,
		corpusStatRows,
	] = await Promise.all([

		// ── Hot queries (top 50 before filter) ──────────────────────────────
		getHotQueries(50).catch(() => []),

		// ── Cluster heat map ─────────────────────────────────────────────────
		getClusterHeatMap(days).catch(() => []),

		// ── Temperature-gated variance pairs ────────────────────────────────
		getVariancePairs({ temperature, limit: 30, days }).catch(() => []),

		// ── QLoRA training stats ─────────────────────────────────────────────
		pool.query<QloraStatRow>(
			`SELECT quality_tier, COUNT(*)::int AS cnt, AVG(response_score)::real AS avg_score
			 FROM   qlora_examples
			 GROUP  BY quality_tier`
		).then((r) => r.rows).catch((): QloraStatRow[] => []),

		// ── Per-chunk quality signals ────────────────────────────────────────
		getChunkQualitySignals(20, days).catch(() => []),

		// ── Pipeline memory: KAG / DAG / RAG / ACE / codebase breakdown ─────
		pool.query<PipelineMemoryRow>(
			`SELECT pipeline,
			        COUNT(*)::int                                                      AS total_hits,
			        COUNT(DISTINCT chunk_id)::int                                      AS unique_chunks,
			        COUNT(DISTINCT query_hash)::int                                    AS unique_queries,
			        AVG(COALESCE(rerank_score, score))::real                           AS avg_rerank,
			        (array_agg(chunk_id      ORDER BY COALESCE(rerank_score, score) DESC))[1] AS top_chunk_id,
			        (array_agg(relative_path ORDER BY COALESCE(rerank_score, score) DESC))[1] AS top_chunk_path
			 FROM   chunk_hit_log
			 WHERE  hit_at > NOW() - ($1 || ' days')::interval
			 GROUP  BY pipeline
			 ORDER  BY total_hits DESC`,
			[String(days)]
		).then((r) => r.rows).catch((): PipelineMemoryRow[] => []),

		// ── Cross-pipeline champions: chunks that win across ≥2 pipelines ────
		// High signal — these chunks are universally relevant regardless of retrieval path.
		// The pgvector/Qdrant cluster label is surfaced via relative_path for admin drill-down.
		pool.query<CrossPipelineChampRow>(
			`SELECT chunk_id,
			        MAX(relative_path)::text                                           AS relative_path,
			        COUNT(DISTINCT pipeline)::int                                      AS pipeline_count,
			        string_agg(DISTINCT pipeline, ', ')                               AS pipelines,
			        COUNT(*)::int                                                      AS total_hits,
			        AVG(COALESCE(rerank_score, score))::real                           AS avg_rerank,
			        (COUNT(*) * AVG(COALESCE(rerank_score, score)))::real              AS quality_score
			 FROM   chunk_hit_log
			 WHERE  hit_at > NOW() - ($1 || ' days')::interval
			 GROUP  BY chunk_id
			 HAVING COUNT(DISTINCT pipeline) >= 2
			 ORDER  BY quality_score DESC
			 LIMIT  10`,
			[String(days)]
		).then((r) => r.rows).catch((): CrossPipelineChampRow[] => []),

		// ── Trending queries: highest growth rate over last 24h vs prior window ─
		// Compares 24h bucket vs (days-1) day bucket — normalised to hits/hour.
		pool.query<TrendingQueryRow>(
			`WITH recent AS (
			   SELECT query_hash, COUNT(*)::real AS cnt
			   FROM   chunk_hit_log
			   WHERE  hit_at > NOW() - INTERVAL '24 hours'
			   GROUP  BY query_hash
			 ),
			 prior AS (
			   SELECT query_hash, COUNT(*)::real / GREATEST($1 - 1, 1) AS cnt_per_day
			   FROM   chunk_hit_log
			   WHERE  hit_at BETWEEN NOW() - ($1 || ' days')::interval
			                     AND NOW() - INTERVAL '24 hours'
			   GROUP  BY query_hash
			 )
			 SELECT r.query_hash,
			        r.cnt::int                                         AS recent_hits,
			        COALESCE(p.cnt_per_day, 0)::int                   AS prior_hits,
			        (r.cnt / GREATEST(COALESCE(p.cnt_per_day, 0.5), 0.5))::real AS growth_rate
			 FROM   recent r
			 LEFT JOIN prior p USING (query_hash)
			 ORDER  BY growth_rate DESC
			 LIMIT  10`,
			[String(days)]
		).then((r) => r.rows).catch((): TrendingQueryRow[] => []),

		// ── "Did you mean?" — only when ?suggest= is provided ───────────────
		suggestFor
			? getDidYouMeanSuggestions(suggestFor, temperature, 5).catch(() => [])
			: Promise.resolve([]),

		// ── Legal corpus coverage ─────────────────────────────────────────
		pool.query<CorpusStatRow>(
			`SELECT corpus_type, processing_status, COUNT(*)::int AS cnt
			 FROM   library_documents
			 GROUP  BY corpus_type, processing_status
			 ORDER  BY corpus_type, processing_status`
		).then((r) => r.rows).catch((): CorpusStatRow[] => []),
	]);

	// ── Apply regex/substring filter to hot queries ────────────────────────
	let hotQueries = hotQueriesRaw;
	if (qFilter) {
		try {
			const re = new RegExp(qFilter, 'i');
			hotQueries = hotQueriesRaw.filter((q) => re.test(q.query));
		} catch {
			const lower = qFilter.toLowerCase();
			hotQueries  = hotQueriesRaw.filter((q) => q.query.toLowerCase().includes(lower));
		}
	}
	hotQueries = hotQueries.slice(0, 20);

	// ── Resolve trending query hashes → text via hot-query ring ───────────
	const hotHashMap = new Map<string, string>(
		hotQueriesRaw.map((q): [string, string] => [q.hash, q.query])
	);
	const trending = trendingQueries.map((t) => ({
		...t,
		query: hotHashMap.get(t.query_hash) ?? null,
	}));

	// ── Build legal corpus coverage summary ───────────────────────────────
	const corpusByType: Record<string, { complete: number; total: number }> = {};
	for (const row of corpusStatRows) {
		if (!corpusByType[row.corpus_type]) corpusByType[row.corpus_type] = { complete: 0, total: 0 };
		corpusByType[row.corpus_type].total += row.cnt;
		if (row.processing_status === 'complete') corpusByType[row.corpus_type].complete += row.cnt;
	}
	const legalCorpusStats = {
		byType:                 corpusByType,
		constitutionCoverage:   Math.round((corpusByType['constitution']?.complete ?? 0) / 53 * 100),
		totalDocuments:         corpusStatRows.reduce((s, r) => s + r.cnt, 0),
		totalComplete:          corpusStatRows.filter(r => r.processing_status === 'complete').reduce((s, r) => s + r.cnt, 0),
	};

	return json({
		hotQueries,
		clusterHeat,
		variancePairs,
		qloraStats,
		chunkQuality,
		pipelineMemory,
		crossPipelineChamps,
		trending,
		didYouMean,
		legalCorpusStats,
		meta: {
			windowDays:    days,
			temperature,
			minSimilarity: minSim,
			qFilter:       qFilter   || null,
			suggestFor:    suggestFor || null,
		},
	});
};