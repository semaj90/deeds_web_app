import {
	pgTable,
	uuid,
	text,
	integer,
	jsonb,
	timestamp,
	doublePrecision,
	index,
} from 'drizzle-orm/pg-core';

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
	indexedAt: timestamp('indexed_at', { withTimezone: true }),
}, (table) => ({
	sourceTypeIdx: index('metadata_envelopes_source_type_idx').on(table.sourceType),
	filePathIdx: index('metadata_envelopes_file_path_idx').on(table.filePath),
	metadataGin: index('metadata_envelopes_metadata_gin').using('gin', table.metadata),
	featuresGin: index('metadata_envelopes_features_gin').using('gin', table.features),
	relationsGin: index('metadata_envelopes_relations_gin').using('gin', table.relations),
}));

export const codeRelations = pgTable('code_relations', {
	id: uuid('id').primaryKey().defaultRandom(),
	sourceKey: text('source_key').notNull(),
	targetKey: text('target_key').notNull(),
	relationType: text('relation_type').notNull(),
	confidence: doublePrecision('confidence').default(1.0),
	evidence: jsonb('evidence').notNull().default({}),
	sourceFile: text('source_file'),
	sourceLine: integer('source_line'),
	targetFile: text('target_file'),
	targetLine: integer('target_line'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
	sourceIdx: index('code_relations_source_idx').on(table.sourceKey),
	targetIdx: index('code_relations_target_idx').on(table.targetKey),
	typeIdx: index('code_relations_type_idx').on(table.relationType),
	evidenceGin: index('code_relations_evidence_gin').using('gin', table.evidence),
}));

export const codebaseAuditEvents = pgTable('codebase_audit_events', {
	id: uuid('id').primaryKey().defaultRandom(),
	auditType: text('audit_type').notNull(),
	stableKey: text('stable_key'),
	actor: text('actor').notNull().default('system'),
	status: text('status').notNull(),
	input: jsonb('input').default({}),
	output: jsonb('output').default({}),
	error: jsonb('error').default({}),
	startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
	finishedAt: timestamp('finished_at', { withTimezone: true }),
	durationMs: integer('duration_ms'),
}, (table) => ({
	typeIdx: index('codebase_audit_events_type_idx').on(table.auditType),
	statusIdx: index('codebase_audit_events_status_idx').on(table.status),
	inputGin: index('codebase_audit_events_input_gin').using('gin', table.input),
	outputGin: index('codebase_audit_events_output_gin').using('gin', table.output),
}));

export const aceRetrievalRuns = pgTable('ace_retrieval_runs', {
	id: uuid('id').primaryKey().defaultRandom(),
	query: text('query').notNull(),
	intent: text('intent'),
	mode: text('mode'),
	model: text('model'),
	queryEmbeddingModel: text('query_embedding_model'),
	expandedTerms: text('expanded_terms').array().default([]),
	contextBudgetTokens: integer('context_budget_tokens'),
	finalContextTokens: integer('final_context_tokens'),
	metadata: jsonb('metadata').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

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
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export type MetadataEnvelope = typeof metadataEnvelopes.$inferSelect;
export type NewMetadataEnvelope = typeof metadataEnvelopes.$inferInsert;

export type CodeRelation = typeof codeRelations.$inferSelect;
export type NewCodeRelation = typeof codeRelations.$inferInsert;

export type CodebaseAuditEvent = typeof codebaseAuditEvents.$inferSelect;
export type NewCodebaseAuditEvent = typeof codebaseAuditEvents.$inferInsert;

export type AceRetrievalRun = typeof aceRetrievalRuns.$inferSelect;
export type NewAceRetrievalRun = typeof aceRetrievalRuns.$inferInsert;

export type AceRetrievalHit = typeof aceRetrievalHits.$inferSelect;
export type NewAceRetrievalHit = typeof aceRetrievalHits.$inferInsert;
