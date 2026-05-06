import {
	pgTable,
	uuid,
	text,
	integer,
	jsonb,
	timestamp,
	doublePrecision,
	index,
	boolean,
    primaryKey,
    unique
} from 'drizzle-orm/pg-core';

export const ragQueryCache = pgTable('rag_query_cache', {
	id: uuid('id').primaryKey().defaultRandom(),
	queryHash: text('query_hash').notNull().unique(),
	normalizedQuery: text('normalized_query').notNull(),
	queryEmbeddingModel: text('query_embedding_model'),
	queryVectorId: text('query_vector_id'),
	entityFingerprint: text('entity_fingerprint'),
	tagFingerprint: text('tag_fingerprint'),
	centroidClusterId: text('centroid_cluster_id'),
	answer: text('answer'),
	answerJson: jsonb('answer_json').default({}),
	hitCount: integer('hit_count').default(0),
	lastHitAt: timestamp('last_hit_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	metadata: jsonb('metadata').default({})
}, (table) => ({
	centroidIdx: index('rag_query_cache_centroid_idx').on(table.centroidClusterId),
	entityIdx: index('rag_query_cache_entity_idx').on(table.entityFingerprint),
	tagsIdx: index('rag_query_cache_tags_idx').on(table.tagFingerprint)
}));

export const qdrantCentroidClusters = pgTable('qdrant_centroid_clusters', {
	id: uuid('id').primaryKey().defaultRandom(),
	clusterKey: text('cluster_key').notNull().unique(),
	collectionName: text('collection_name').notNull(),
	label: text('label'),
	summary: text('summary'),
	centroidPointId: text('centroid_point_id'),
	centroidVectorHash: text('centroid_vector_hash'),
	tags: text('tags').array().default([]),
	directoryPaths: text('directory_paths').array().default([]),
	memberCount: integer('member_count').default(0),
	avgScore: doublePrecision('avg_score'),
	pageRank: doublePrecision('page_rank'),
	metadata: jsonb('metadata').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
}, (table) => ({
	tagsGin: index('qdrant_centroid_clusters_tags_gin').using('gin', table.tags),
	dirsGin: index('qdrant_centroid_clusters_dirs_gin').using('gin', table.directoryPaths)
}));

export const qdrantClusterMembers = pgTable('qdrant_cluster_members', {
	clusterKey: text('cluster_key').notNull(),
	stableKey: text('stable_key').notNull(),
	qdrantPointId: text('qdrant_point_id').notNull(),
	filePath: text('file_path'),
	directoryPath: text('directory_path'),
	membershipScore: doublePrecision('membership_score').default(1.0),
	tags: text('tags').array().default([]),
	metadata: jsonb('metadata').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, (table) => ({
	pk: primaryKey({ columns: [table.clusterKey, table.stableKey] }),
	fileIdx: index('qdrant_cluster_members_file_idx').on(table.filePath),
	dirIdx: index('qdrant_cluster_members_dir_idx').on(table.directoryPath)
}));

export const llmSummaryCache = pgTable('llm_summary_cache', {
	id: uuid('id').primaryKey().defaultRandom(),
	stableKey: text('stable_key').notNull().unique(),
	sourceType: text('source_type').notNull(),
	sourceHash: text('source_hash').notNull(),
	model: text('model').notNull(),
	summaryShort: text('summary_short'),
	summaryLong: text('summary_long'),
	jsonSummary: jsonb('json_summary').default({}),
	embeddingModel: text('embedding_model'),
	qdrantPointId: text('qdrant_point_id'),
	tags: text('tags').array().default([]),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
}, (table) => ({
	tagsGin: index('llm_summary_cache_tags_gin').using('gin', table.tags),
	jsonGin: index('llm_summary_cache_json_gin').using('gin', table.jsonSummary)
}));

export const kagDagRuns = pgTable('kag_dag_runs', {
	id: uuid('id').primaryKey().defaultRandom(),
	query: text('query').notNull(),
	queryHash: text('query_hash').notNull(),
	intent: text('intent'),
	status: text('status').notNull(),
	model: text('model'),
	totalDurationMs: integer('total_duration_ms'),
	finalAnswer: text('final_answer'),
	finalJson: jsonb('final_json').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	finishedAt: timestamp('finished_at', { withTimezone: true }),
	metadata: jsonb('metadata').default({})
});

export const kagDagNodes = pgTable('kag_dag_nodes', {
	id: uuid('id').primaryKey().defaultRandom(),
	runId: uuid('run_id').references(() => kagDagRuns.id, { onDelete: 'cascade' }),
	nodeKey: text('node_key').notNull(),
	nodeType: text('node_type').notNull(),
	input: jsonb('input').default({}),
	output: jsonb('output').default({}),
	status: text('status').notNull(),
	cacheHit: boolean('cache_hit').default(false),
	startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
	finishedAt: timestamp('finished_at', { withTimezone: true }),
	durationMs: integer('duration_ms'),
	error: jsonb('error').default({})
}, (table) => ({
	uniqueRunNode: unique().on(table.runId, table.nodeKey),
	runIdx: index('kag_dag_nodes_run_idx').on(table.runId),
	typeIdx: index('kag_dag_nodes_type_idx').on(table.nodeType),
	cacheIdx: index('kag_dag_nodes_cache_idx').on(table.cacheHit)
}));

export const kagDagEdges = pgTable('kag_dag_edges', {
	runId: uuid('run_id').references(() => kagDagRuns.id, { onDelete: 'cascade' }),
	fromNodeKey: text('from_node_key').notNull(),
	toNodeKey: text('to_node_key').notNull(),
	edgeType: text('edge_type').default('depends_on'),
	metadata: jsonb('metadata').default({})
}, (table) => ({
	pk: primaryKey({ columns: [table.runId, table.fromNodeKey, table.toNodeKey] })
}));

export const memoryGainAudits = pgTable('memory_gain_audits', {
	id: uuid('id').primaryKey().defaultRandom(),
	query: text('query').notNull(),
	topic: text('topic'),
	candidateHash: text('candidate_hash').notNull(),
	existingMemoryIds: text('existing_memory_ids').array().default([]),
	gainScore: doublePrecision('gain_score'),
	decision: text('decision').notNull(), // 'accepted' | 'rejected'
	accuracyScore: doublePrecision('accuracy_score'),
	densityScore: doublePrecision('density_score'),
	clarityScore: doublePrecision('clarity_score'),
	noveltyScore: doublePrecision('novelty_score'),
	reasoning: text('reasoning'),
	improvements: text('improvements').array().default([]),
	metadata: jsonb('metadata').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, (table) => ({
	queryIdx: index('memory_gain_audits_query_idx').on(table.query),
	decisionIdx: index('memory_gain_audits_decision_idx').on(table.decision),
	scoreIdx: index('memory_gain_audits_score_idx').on(table.gainScore)
}));
