import {
	pgTable,
	text,
	integer,
	timestamp,
	jsonb,
	uuid,
	boolean,
	varchar,
	doublePrecision,
	index
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * ACE Retrieval Runs
 * Log of each agentic retrieval attempt.
 */
export const aceRetrievalRuns = pgTable('ace_retrieval_runs', {
	id: uuid('id').primaryKey().defaultRandom(),
	query: text('query').notNull(),
	intent: text('intent'),
	mode: text('mode'),
	model: text('model'),
	queryEmbeddingModel: text('query_embedding_model'),
	expandedTerms: text('expanded_terms').array().default(sql`'{}'::text[]`),
	contextBudgetTokens: integer('context_budget_tokens'),
	finalContextTokens: integer('final_context_tokens'),
	metadata: jsonb('metadata').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
});

/**
 * ACE Retrieval Hits
 * Individual chunk/document hits for a specific run.
 */
export const aceRetrievalHits = pgTable('ace_retrieval_hits', {
	id: uuid('id').primaryKey().defaultRandom(),
	runId: uuid('run_id').references(() => aceRetrievalRuns.id, { onDelete: 'cascade' }),
	stableKey: text('stable_key').notNull(),
	chunkId: text('chunk_id'),
	filePath: text('file_path'),
	source: text('source').notNull(),
	vectorScore: doublePrecision('vector_score'),
	graphScore: doublePrecision('graph_score'),
	tagScore: doublePrecision('tag_score'),
	recencyScore: doublePrecision('recency_score'),
	errorRelevanceScore: doublePrecision('error_relevance_score'),
	finalScore: doublePrecision('final_score'),
	rank: integer('rank'),
	reason: text('reason'),
	metadata: jsonb('metadata').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
});

/**
 * Memory Gain Audits
 * Tracks the "knowledge gain" of new information compared to existing memory.
 */
export const memoryGainAudits = pgTable('memory_gain_audits', {
	id: uuid('id').primaryKey().defaultRandom(),
	query: text('query').notNull(),
	topic: text('topic'),
	candidateHash: text('candidate_hash').notNull(),
	existingMemoryIds: text('existing_memory_ids').array().default(sql`'{}'::text[]`),
	gainScore: doublePrecision('gain_score'),
	decision: text('decision').notNull(),
	accuracyScore: doublePrecision('accuracy_score'),
	densityScore: doublePrecision('density_score'),
	clarityScore: doublePrecision('clarity_score'),
	noveltyScore: doublePrecision('novelty_score'),
	reasoning: text('reasoning'),
	improvements: text('improvements').array().default(sql`'{}'::text[]`),
	metadata: jsonb('metadata').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, (table) => ({
	queryIdx: index('memory_gain_audits_query_idx').on(table.query),
	decisionIdx: index('memory_gain_audits_decision_idx').on(table.decision),
	scoreIdx: index('memory_gain_audits_score_idx').on(table.gainScore)
}));

/**
 * Metadata Envelopes
 * Standardized envelope for heterogeneous metadata sources.
 */
export const metadataEnvelopes = pgTable('metadata_envelopes', {
	id: uuid('id').primaryKey().defaultRandom(),
	sourceType: text('source_type').notNull(),
	stableKey: text('stable_key').notNull().unique(),
	repoRoot: text('repo_root'),
	filePath: text('file_path'),
	directoryPath: text('directory_path'),
	name: text('name'),
	language: text('language'),
	contentHash: text('content_hash'),
	schemaVersion: integer('schema_version').notNull().default(1),
	metadata: jsonb('metadata').notNull().default({}),
	features: jsonb('features').notNull().default({}),
	relations: jsonb('relations').notNull().default([]),
	diagnostics: jsonb('diagnostics').notNull().default([]),
	embeddingModel: text('embedding_model'),
	qdrantCollection: text('qdrant_collection'),
	qdrantPointId: text('qdrant_point_id'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
	indexedAt: timestamp('indexed_at', { withTimezone: true })
}, (table) => ({
	sourceTypeIdx: index('metadata_envelopes_source_type_idx').on(table.sourceType),
	filePathIdx: index('metadata_envelopes_file_path_idx').on(table.filePath),
	metadataGin: index('metadata_envelopes_metadata_gin').using('gin', table.metadata),
	featuresGin: index('metadata_envelopes_features_gin').using('gin', table.features),
	relationsGin: index('metadata_envelopes_relations_gin').using('gin', table.relations)
}));

/**
 * Code LLM Index
 * Cache of LLM-generated summaries and cluster assignments for code artifacts.
 */
export const codeLlmIndex = pgTable('code_llm_index', {
	pathHash: varchar('path_hash', { length: 16 }).primaryKey(),
	path: text('path').notNull(),
	isDir: boolean('is_dir').notNull().default(false),
	llmOutput: text('llm_output').notNull(),
	source: varchar('source', { length: 32 }).notNull().default('ace'),
	query: text('query'),
	glyphClusterId: integer('glyph_cluster_id'),
	somBmuRow: integer('som_bmu_row'),
	somBmuCol: integer('som_bmu_col'),
	hitCount: integer('hit_count').notNull().default(0),
	tokenCount: integer('token_count'),
	outputMeta: jsonb('output_meta').notNull().default({}),
	generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
	lastHitAt: timestamp('last_hit_at', { withTimezone: true }).notNull().defaultNow(),
	refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
	clusterIdx: index('code_llm_index_cluster_idx').on(table.glyphClusterId),
	lastHitIdx: index('code_llm_index_last_hit_idx').on(table.lastHitAt),
	hitCountIdx: index('code_llm_index_hit_count_idx').on(table.hitCount),
	sourceIdx: index('code_llm_index_source_idx').on(table.source),
	outputMetaGin: index('code_llm_index_output_meta_gin').using('gin', sql`${table.outputMeta} jsonb_path_ops`)
}));
