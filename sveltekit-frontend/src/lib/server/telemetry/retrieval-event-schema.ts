/**
 * Phase 2F: Retrieval Event Schema
 *
 * Captures complete trace of retrieval pipeline execution:
 * query_id → embedding_model → vector_lane → BM25_score → AST_score → RRF_score → rerank_score → selected_packet → latency → cache_hit → GPU_usage
 *
 * Non-blocking async write pattern: fire-and-forget to Postgres + Langfuse + ClickHouse
 * Do NOT await event writes in the retrieval path; use .catch() to handle errors gracefully
 */

import { z } from 'zod';

/**
 * Per-stage latency: measurements at each step of the retrieval pipeline
 * Use these to identify bottlenecks and optimize weights
 */
export const RetrievalStageResultSchema = z.object({
	score: z.number().min(0).max(1).describe('Score for this result (0.0 to 1.0)'),
	packet_key: z.string().describe('Unique packet identifier'),
	rank: z.number().int().positive().describe('Rank in this stage (1-based)')
});

export type RetrievalStageResult = z.infer<typeof RetrievalStageResultSchema>;

/**
 * RRF fusion results after combining vector + BM25 + AST
 * Shows which sources contributed to each result
 */
export const RRFFusionResultSchema = z.object({
	score: z.number().min(0).max(1),
	packet_key: z.string(),
	sources: z.array(z.enum(['vector', 'bm25', 'ast'])).min(1).describe('Which lanes produced this result')
});

export type RRFFusionResult = z.infer<typeof RRFFusionResultSchema>;

/**
 * Optional reranking results (cross-encoder or LLM-based)
 * Applied after RRF fusion if enabled
 */
export const RerankerResultSchema = z.object({
	score: z.number().min(0).max(1),
	packet_key: z.string()
});

export type RerankerResult = z.infer<typeof RerankerResultSchema>;

/**
 * Recommendation synthesized from retrieval results
 * Filled by the Recommendation Engine (Phase 2G) after retrieval completes
 */
export const RecommendationSchema = z.object({
	type: z.enum([
		'related_api',
		'likely_bug',
		'missing_import',
		'relevant_schema',
		'test_to_run',
		'ontology_concept',
		'suggested_tool',
		'suggested_agent'
	]),
	score: z.number().min(0).max(1).describe('Recommendation confidence (0.0 to 1.0)'),
	payload: z.record(z.unknown()).describe('Type-specific recommendation details')
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

/**
 * Complete retrieval event trace
 * This is the fundamental data structure for Phase 2F/2G/3A observability
 */
export const RetrievalEventSchema = z.object({
	// ========== IDENTITY ==========
	query_id: z.string().uuid().describe('Unique query ID for this retrieval'),
	timestamp: z.date().describe('When the query was executed'),
	session_id: z.string().uuid().optional().describe('User session ID if authenticated'),

	// ========== QUERY INPUT ==========
	query_text: z.string().min(1).describe('The query text'),
	embedding_model: z.string().default('embeddinggemma:latest').describe('Model used for query embedding'),
	query_embedding_dim: z.number().int().positive().default(384).describe('Embedding dimensionality'),

	// ========== VECTOR LANE ==========
	vector_lane_latency_ms: z.number().nonnegative().describe('Time to embed query + search Qdrant'),
	vector_lane_top_k: z.number().int().positive().default(10).describe('Number of results from vector search'),
	vector_lane_results: z.array(RetrievalStageResultSchema).min(1).describe('Top-K vector search results'),

	// ========== BM25 LANE ==========
	bm25_latency_ms: z.number().nonnegative().describe('Time to execute BM25 full-text search'),
	bm25_top_k: z.number().int().positive().default(10).describe('Number of results from BM25 search'),
	bm25_results: z.array(RetrievalStageResultSchema).min(1).describe('Top-K BM25 full-text results'),

	// ========== AST LANE ==========
	ast_latency_ms: z.number().nonnegative().describe('Time to execute AST structure search'),
	ast_results: z.array(RetrievalStageResultSchema).min(1).describe('Top-K AST structure results'),

	// ========== RRF FUSION ==========
	rrf_latency_ms: z.number().nonnegative().describe('Time to fuse three lanes via Reciprocal Rank Fusion'),
	rrf_weights: z
		.object({
			vector: z.number().min(0).max(1),
			bm25: z.number().min(0).max(1),
			ast: z.number().min(0).max(1)
		})
		.optional()
		.describe('Weights used for RRF (will sum to 1.0)'),
	rrf_results: z.array(RRFFusionResultSchema).min(1).describe('Merged results after RRF fusion'),

	// ========== RERANKING ==========
	rerank_latency_ms: z.number().nonnegative().optional().describe('Time to rerank with cross-encoder or LLM'),
	rerank_model: z.string().optional().describe('Reranker model name (if applied)'),
	rerank_results: z.array(RerankerResultSchema).optional().describe('Reranked results (if reranking applied)'),

	// ========== FINAL SELECTION ==========
	selected_packet_key: z.string().describe('Which packet was selected as the top result'),
	final_score: z.number().min(0).max(1).describe('Final composite score for selected packet'),

	// ========== SYSTEM METRICS ==========
	total_latency_ms: z.number().nonnegative().describe('End-to-end retrieval latency'),
	cache_hit: z.boolean().describe('Whether result was served from cache'),
	cache_type: z.enum(['L1_exact', 'L2_semantic', 'none']).optional().describe('Type of cache hit (if any)'),
	gpu_memory_used_mb: z.number().nonnegative().describe('GPU memory consumed during retrieval (approximate)'),

	// ========== OPTIONAL: RECOMMENDATIONS ==========
	recommendations: z.array(RecommendationSchema).optional().describe('Recommended next steps (filled by Phase 2G)')
});

export type RetrievalEvent = z.infer<typeof RetrievalEventSchema>;

/**
 * Helper to construct a valid RetrievalEvent with sensible defaults
 * Used by retrieval orchestrator to build event envelope
 */
export function createRetrievalEvent(overrides: Partial<RetrievalEvent>): RetrievalEvent {
	const defaults: RetrievalEvent = {
		query_id: crypto.randomUUID(),
		timestamp: new Date(),
		query_text: '',
		embedding_model: 'embeddinggemma:latest',
		query_embedding_dim: 384,
		vector_lane_latency_ms: 0,
		vector_lane_top_k: 10,
		vector_lane_results: [],
		bm25_latency_ms: 0,
		bm25_top_k: 10,
		bm25_results: [],
		ast_latency_ms: 0,
		ast_results: [],
		rrf_latency_ms: 0,
		rrf_results: [],
		selected_packet_key: '',
		final_score: 0,
		total_latency_ms: 0,
		cache_hit: false,
		gpu_memory_used_mb: 0
	};

	return RetrievalEventSchema.parse({ ...defaults, ...overrides });
}

/**
 * Validation: ensure event is complete before writing
 * Called by RetrievalEventWriter.writeEvent()
 */
export function validateRetrievalEvent(event: unknown): [boolean, string[]] {
	const result = RetrievalEventSchema.safeParse(event);

	if (!result.success) {
		const errors = result.error.errors.map(err => {
			const path = err.path.join('.');
			return `${path || 'root'}: ${err.message}`;
		});
		return [false, errors];
	}

	return [true, []];
}
