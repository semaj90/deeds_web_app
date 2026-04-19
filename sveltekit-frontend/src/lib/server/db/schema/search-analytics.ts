/**
 * Search Analytics Schema
 *
 * Drizzle-tracked definitions for the search intelligence pipeline tables.
 * These tables are populated by:
 *   - chunk_hit_log:         recordChunkHits() in search-analytics.ts (fire-and-forget)
 *   - query_variance_pairs:  recordVariancePair() in search-analytics.ts
 *   - rag_query_log:         recordQueryLog() in search-analytics.ts
 *   - qlora_examples:        POST /api/analytics/qlora-dataset (distillation)
 *   - response_feedback:     POST /api/analytics/feedback (thumbs up/down)
 *
 * NOTE: chunk_hit_log, query_variance_pairs, rag_query_log may already exist
 * in the database from drizzle/manual/rag_query_analytics.sql.
 * The generated migration uses CREATE TABLE IF NOT EXISTS for safety.
 */
import {
	bigserial,
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	real,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── chunk_hit_log ──────────────────────────────────────────────────────────────
// Per-chunk retrieval event log. One row per chunk × query × pipeline pass.
// Powers: heatmap, pipeline memory, cross-pipeline champions, trending queries.

export const chunkHitLog = pgTable('chunk_hit_log', {
	id:          bigserial('id', { mode: 'number' }).primaryKey(),
	chunkId:     text('chunk_id').notNull(),
	relativePath: text('relative_path').notNull().default(''),
	gpuCluster:  integer('gpu_cluster'),
	somCluster:  integer('som_cluster'),
	pipeline:    text('pipeline').notNull(),               // 'ace'|'kag'|'dag'|'rag'|'reranker'|'codebase'|'feedback'
	queryHash:   varchar('query_hash', { length: 16 }).notNull(),
	score:       real('score'),
	rerankScore: real('rerank_score'),
	userId:      uuid('user_id'),
	caseId:      uuid('case_id'),
	hitAt:       timestamp('hit_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
	pipelineClusterIdx: index('chunk_hit_pipeline_cluster_idx').on(t.pipeline, t.gpuCluster, t.hitAt),
	queryHashIdx:       index('chunk_hit_query_hash_idx').on(t.queryHash, t.hitAt),
}));

export type ChunkHitLog    = typeof chunkHitLog.$inferSelect;
export type NewChunkHitLog = typeof chunkHitLog.$inferInsert;

// ── query_variance_pairs ───────────────────────────────────────────────────────
// Bifrost L2 semantic match pairs. Powers "did you mean" and variance analysis.
// One row per canonical pair (LEAST/GREATEST dedup on hashes).

export const queryVariancePairs = pgTable('query_variance_pairs', {
	id:          bigserial('id', { mode: 'number' }).primaryKey(),
	queryHashA:  varchar('query_hash_a', { length: 16 }).notNull(),
	queryHashB:  varchar('query_hash_b', { length: 16 }).notNull(),
	queryA:      text('query_a').notNull(),
	queryB:      text('query_b').notNull(),
	similarity:  real('similarity').notNull(),
	hitCount:    integer('hit_count').notNull().default(1),
	pipeline:    text('pipeline'),
	lastSeen:    timestamp('last_seen', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
	pairUniqueIdx: uniqueIndex('query_variance_pairs_pair_idx')
		.on(sql`LEAST(${t.queryHashA}, ${t.queryHashB})`, sql`GREATEST(${t.queryHashA}, ${t.queryHashB})`),
	hashAIdx:      index('query_variance_pairs_a_idx').on(t.queryHashA),
}));

export type QueryVariancePair    = typeof queryVariancePairs.$inferSelect;
export type NewQueryVariancePair = typeof queryVariancePairs.$inferInsert;

// ── rag_query_log ──────────────────────────────────────────────────────────────
// Per-query stats for RAG/KAG/DAG retrieval passes.
// Powers: quality regression alerts, QLoRA distillation source.

export const ragQueryLog = pgTable('rag_query_log', {
	id:                 uuid('id').defaultRandom().primaryKey(),
	userId:             uuid('user_id'),
	caseId:             uuid('case_id'),
	query:              text('query').notNull(),
	queryHash:          varchar('query_hash', { length: 16 }).notNull(),
	entityStatutes:     jsonb('entity_statutes').notNull().default(sql`'[]'::jsonb`),
	entityCases:        jsonb('entity_cases').notNull().default(sql`'[]'::jsonb`),
	totalEntityTags:    integer('total_entity_tags').notNull().default(0),
	totalFound:         integer('total_found').notNull().default(0),
	searchTimeMs:       integer('search_time_ms'),
	rerankTimeMs:       integer('rerank_time_ms'),
	rerankL0Hit:        boolean('rerank_l0_hit').notNull().default(false),
	rerankL1Hits:       integer('rerank_l1_hits').notNull().default(0),
	rerankFreshScored:  integer('rerank_fresh_scored').notNull().default(0),
	topChunkId:         varchar('top_chunk_id', { length: 255 }),
	topChunkScore:      real('top_chunk_score'),
	topRerankScore:     real('top_rerank_score'),
	dagEnabled:         boolean('dag_enabled').notNull().default(true),
	dagStatus:          varchar('dag_status', { length: 20 }),
	hybridSearch:       boolean('hybrid_search').notNull().default(false),
	createdAt:          timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
	userCreatedIdx: index('rag_query_log_user_created_idx').on(t.userId, t.createdAt),
	hashIdx:        index('rag_query_log_hash_idx').on(t.queryHash),
}));

export type RagQueryLog    = typeof ragQueryLog.$inferSelect;
export type NewRagQueryLog = typeof ragQueryLog.$inferInsert;

// ── qlora_examples ─────────────────────────────────────────────────────────────
// Distilled high-quality RAG/ACE interactions for fine-tuning.
// Unique on query_hash — one canonical example per query pattern.
// Populated by POST /api/analytics/qlora-dataset.

export const qloraExamples = pgTable('qlora_examples', {
	id:             uuid('id').defaultRandom().primaryKey(),
	query:          text('query'),                              // original query text (denormalised for export)
	queryHash:      varchar('query_hash', { length: 16 }).notNull(),
	instruction:    text('instruction').notNull(),
	contextChunks:  jsonb('context_chunks').notNull().default(sql`'[]'::jsonb`),
	graphSummary:   text('graph_summary'),
	response:       text('response').notNull(),
	qualityTier:    varchar('quality_tier', { length: 20 }),    // 'platinum'|'gold'|'silver'|'bronze'
	responseScore:  real('response_score'),
	avgRerankScore: real('avg_rerank_score'),
	gpuClusters:    jsonb('gpu_clusters').notNull().default(sql`'[]'::jsonb`),
	pipelineHits:   jsonb('pipeline_hits').notNull().default(sql`'{}'::jsonb`),
	entityTags:     jsonb('entity_tags').notNull().default(sql`'[]'::jsonb`),  // extracted statute + case entity tags
	modelVersion:   varchar('model_version', { length: 50 }),  // e.g. 'gemma4-legal'
	datasetSplit:   varchar('dataset_split', { length: 10 }),   // 'train'|'eval'|'test' — frozen after first assignment
	createdAt:      timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
	queryHashIdx: index('qlora_examples_query_hash_idx').on(t.queryHash),
	qualityIdx:   index('qlora_examples_quality_idx').on(t.qualityTier, t.responseScore),
	createdIdx:   index('qlora_examples_created_idx').on(t.createdAt),
}));

export type QloraExample    = typeof qloraExamples.$inferSelect;
export type NewQloraExample = typeof qloraExamples.$inferInsert;

// ── response_feedback ──────────────────────────────────────────────────────────
// Thumbs up/down on query responses. Drives QLoRA quality tier and distillation.
// One row per (query_hash, user_id) — upserted on re-vote.

export const responseFeedback = pgTable('response_feedback', {
	id:        uuid('id').defaultRandom().primaryKey(),
	queryHash: text('query_hash').notNull(),
	userId:    uuid('user_id'),
	rating:    varchar('rating', { length: 4 }).notNull(),   // 'up' | 'down'
	pipeline:  text('pipeline'),
	chunkIds:  text('chunk_ids').array(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
	hashIdx:        index('response_feedback_hash_idx').on(t.queryHash),
	userIdx:        index('response_feedback_user_idx').on(t.userId),
	hashUserUnique: uniqueIndex('response_feedback_hash_user_idx').on(t.queryHash, t.userId),
}));

export type ResponseFeedback    = typeof responseFeedback.$inferSelect;
export type NewResponseFeedback = typeof responseFeedback.$inferInsert;

// ── predictive_todos ────────────────────────────────────────────────────────
// LLM + rule-based gap analysis output from POST /api/analytics/generate-todos.
// Drives the post-graph pipeline: research → gap analysis → actionable todos.

export const predictiveTodos = pgTable('predictive_todos', {
	id:              uuid('id').defaultRandom().primaryKey(),
	todoType:        text('todo_type').notNull(),          // 'add_cluster_summary'|'reindex_cluster'|'add_kb_article'|'fix_collection'|'qlora_retrain'|'add_qlora_training'
	gpuCluster:      integer('gpu_cluster'),
	reason:          text('reason').notNull(),
	suggestedAction: text('suggested_action').notNull(),
	estimatedImpact: text('estimated_impact').notNull(),  // 'high'|'medium'|'low'
	status:          text('status').notNull().default('pending'),  // 'pending'|'in_progress'|'done'|'dismissed'
	generatedAt:     timestamp('generated_at', { withTimezone: true }).notNull().default(sql`now()`),
	resolvedAt:      timestamp('resolved_at', { withTimezone: true }),
	metadata:        jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
}, (t) => ({
	statusImpactIdx: index('predictive_todos_status_impact_idx').on(t.status, t.estimatedImpact, t.generatedAt),
}));

export type PredictiveTodo    = typeof predictiveTodos.$inferSelect;
export type NewPredictiveTodo = typeof predictiveTodos.$inferInsert;
