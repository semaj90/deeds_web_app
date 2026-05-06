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
	primaryKey,
	real,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
	vector,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from '../schema-postgres';
import { codeRepos } from './codebase-intelligence';

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
	somClusters:    jsonb('som_clusters').notNull().default(sql`'[]'::jsonb`),
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

// ── codebase_chunk_index ──────────────────────────────────────────────────────
// pgvector mirror of Qdrant codebase_chunks_768 — enables SQL joins, QLoRA hydration,
// and summary-based vector search without Qdrant dependency.

export const codebaseChunkIndex = pgTable(
  'codebase_chunk_index',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    qdrantId: varchar('qdrant_id', { length: 64 }).unique(),
    repoId: uuid('repo_id').references(() => codeRepos.repoId, { onDelete: 'set null' }),
    relativePath: text('relative_path').notNull(),
    symbol: varchar('symbol', { length: 255 }),
    kind: varchar('kind', { length: 50 }),
    domain: varchar('domain', { length: 50 }),
    language: varchar('language', { length: 20 }),
    extension: varchar('extension', { length: 20 }),
    lineStart: integer('line_start'),
    lineEnd: integer('line_end'),
    contentHash: text('content_hash'),
    tokenCount: integer('token_count'),
    content: text('content'),
    summary: text('summary'),
    contentEmbedding: vector('content_embedding', { dimensions: 768 }),
    signatureEmbedding: vector('signature_embedding', { dimensions: 768 }),
    summaryEmbedding: vector('summary_embedding', { dimensions: 768 }),
    gpuCluster: integer('gpu_cluster'),
    somCluster: integer('som_cluster'),
    neo4jGpuCluster: integer('neo4j_gpu_cluster'),
    pageRankScore: real('page_rank_score'),
    communityId: integer('community_id'),
    tags: jsonb('tags')
      .notNull()
      .default(sql`'[]'::jsonb`), // legacy jsonb tags
    semanticTags: text('semantic_tags')
      .array()
      .notNull()
      .default(sql`'{}'`), // typed Karpathy atoms
    clusterSummary: jsonb('cluster_summary')
      .notNull()
      .default(sql`'{}'::jsonb`),
    neoMeta: jsonb('neo4j_meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    embeddingModel: varchar('embedding_model', { length: 100 }),
    summaryModel: varchar('summary_model', { length: 100 }),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`), // flexible enrichment
    /**
     * Structured 1-3 sentence summary + citations + confidence.
     * Stored as JSONB so simdjson AVX2 fast-parse can decode at 2-5× V8 speed
     * when ACE bulk-fetches cached RAG/KAG/DAG outputs across a cluster.
     * Schema matches CodeLlmOutputMeta from code_llm_index.
     */
    outputMeta: jsonb('output_meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    indexedAt: timestamp('indexed_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    enrichedAt: timestamp('enriched_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    pathIdx: index('codebase_chunk_index_path_idx').on(t.relativePath),
    gpuClusterIdx: index('codebase_chunk_index_gpu_cluster_idx').on(t.gpuCluster),
    somClusterIdx: index('codebase_chunk_index_som_cluster_idx').on(t.somCluster),
    domainIdx: index('codebase_chunk_index_domain_idx').on(t.domain),
    languageIdx: index('codebase_chunk_index_language_idx').on(t.language),
    extensionIdx: index('codebase_chunk_index_extension_idx').on(t.extension),
    repoIdx: index('idx_codebase_chunk_index_repo_id').on(t.repoId),
    neo4jClusterIdx: index('idx_codebase_chunk_index_neo4j_gpu_cluster').on(t.neo4jGpuCluster),
  })
);

export type CodebaseChunkIndex    = typeof codebaseChunkIndex.$inferSelect;
export type NewCodebaseChunkIndex = typeof codebaseChunkIndex.$inferInsert;

// ── cluster_summaries ─────────────────────────────────────────────────────────
// One row per (repo, gpu_cluster) — GPU-derived narrative + representative chunks.

export const clusterSummaries = pgTable('cluster_summaries', {
	id:                     uuid('id').defaultRandom().primaryKey(),
	repoId:                 text('repo_id').notNull().default('default'),
	gpuCluster:             integer('gpu_cluster').notNull(),
	summary:                text('summary').notNull(),
	purpose:                text('purpose'),
	patterns:               text('patterns').array(),
	warnings:               text('warnings').array(),
	representativeChunkIds: uuid('representative_chunk_ids').array().notNull().default(sql`'{}'`),
	memberCount:            integer('member_count').notNull().default(0),
	tags:                   text('tags').array().notNull().default(sql`'{}'`),
	centroidDistanceMean:   real('centroid_distance_mean'),
	summaryModel:           varchar('summary_model', { length: 100 }),
	summaryEmbedding:       vector('summary_embedding', { dimensions: 768 }),
	metadata:               jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
	createdAt:              timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
	updatedAt:              timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
	repoClusterUniq: index('cluster_summaries_repo_cluster').on(t.repoId, t.gpuCluster),
}));

export type ClusterSummary    = typeof clusterSummaries.$inferSelect;
export type NewClusterSummary = typeof clusterSummaries.$inferInsert;

// ── llm_outputs ───────────────────────────────────────────────────────────────
// Each LLM generation tracked with provenance for ACE context assembly.

export const llmOutputs = pgTable('llm_outputs', {
	outputId:    uuid('output_id').defaultRandom().primaryKey(),
	caseId:      uuid('case_id'),
	userId:      integer('user_id').references(() => users.id, { onDelete: 'set null' }),
	pipeline:    varchar('pipeline', { length: 50 }).notNull().default('ace'),
	prompt:      text('prompt').notNull(),
	response:    text('response').notNull(),
	model:       varchar('model', { length: 100 }),
	temperature: real('temperature'),
	tokensIn:    integer('tokens_in'),
	tokensOut:   integer('tokens_out'),
	latencyMs:   integer('latency_ms'),
	selfEval:    real('self_eval'),
	metadata:    jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
	createdAt:   timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
	caseIdx:         index('llm_outputs_case_idx').on(t.caseId),
	userCreatedIdx:  index('llm_outputs_user_created').on(t.userId, t.createdAt),
	pipelineIdx:     index('llm_outputs_pipeline_created').on(t.pipeline, t.createdAt),
}));

export type LlmOutput    = typeof llmOutputs.$inferSelect;
export type NewLlmOutput = typeof llmOutputs.$inferInsert;

// ── llm_output_chunks ─────────────────────────────────────────────────────────
// 1:N join between LLM outputs and source chunks (evidence, context, citation).

export const llmOutputChunks = pgTable('llm_output_chunks', {
	outputId: uuid('output_id').notNull().references(() => llmOutputs.outputId, { onDelete: 'cascade' }),
	chunkId:  uuid('chunk_id').notNull().references(() => codebaseChunkIndex.id, { onDelete: 'cascade' }),
	rank:     integer('rank').notNull(),
	score:    real('score'),
	role:     varchar('role', { length: 30 }),
	metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
}, (t) => ({
	pk:       primaryKey({ columns: [t.outputId, t.chunkId] }),
	chunkIdx: index('llm_output_chunks_chunk_idx').on(t.chunkId),
}));
