import { index, integer, jsonb, pgTable, real, text, timestamp, unique, uuid, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Table: memory_registry
 * Durable trace mapping registry linking queries, intents, and retrieved IDs.
 */
export const memoryRegistry = pgTable(
	'memory_registry',
	{
		id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
		sourceId: text('source_id').notNull(),
		chunkId: text('chunk_id'),
		summaryId: text('summary_id'),
		embeddingId: text('embedding_id'),
		clusterId: text('cluster_id'),
		packetId: text('packet_id'),
		memoryId: text('memory_id'),
		featureFamily: text('feature_family').notNull(),
		userIntent: text('user_intent').notNull(),
		tags: jsonb('tags').notNull().default(sql`'{}'::jsonb`),
		hotness: real('hotness').notNull().default(0),
		metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		sourceIdIdx: index('idx_memory_registry_source_id').on(t.sourceId),
		featureFamilyIdx: index('idx_memory_registry_feature_family').on(t.featureFamily),
		userIntentIdx: index('idx_memory_registry_user_intent').on(t.userIntent),
		memoryIdIdx: index('idx_memory_registry_memory_id').on(t.memoryId),
	})
);

export type MemoryRegistryEntry = typeof memoryRegistry.$inferSelect;
export type NewMemoryRegistryEntry = typeof memoryRegistry.$inferInsert;

/**
 * Table: engram_cards
 * Cached and/or consolidated cognitive engrams representing learned routing heuristics.
 */
export const engramCards = pgTable(
	'engram_cards',
	{
		id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
		memoryId: text('memory_id').notNull(),
		scope: text('scope').notNull(), // user | case | repo | agent | global
		summary: text('summary').notNull(),
		labels: jsonb('labels').notNull().default(sql`'[]'::jsonb`),
		relatedPaths: jsonb('related_paths').notNull().default(sql`'[]'::jsonb`),
		relatedTools: jsonb('related_tools').notNull().default(sql`'[]'::jsonb`),
		didYouMean: jsonb('did_you_mean').notNull().default(sql`'[]'::jsonb`),
		sourceRefs: jsonb('source_refs').notNull().default(sql`'[]'::jsonb`),
		embeddingId: text('embedding_id'),
		qdrantPointId: text('qdrant_point_id'),
		ttlSeconds: integer('ttl_seconds'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		memoryIdUq: unique('engram_cards_memory_id_uq').on(t.memoryId),
		scopeIdx: index('idx_engram_cards_scope').on(t.scope),
	})
);

export type EngramCard = typeof engramCards.$inferSelect;
export type NewEngramCard = typeof engramCards.$inferInsert;

/**
 * Table: intent_eval_runs
 * Logging intent classification predictions, evaluations, corrections, and rewards.
 */
export const intentEvalRuns = pgTable(
	'intent_eval_runs',
	{
		id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
		runId: text('run_id').notNull(),
		userQuery: text('user_query').notNull(),
		predictedIntent: text('predicted_intent').notNull(),
		confidence: real('confidence').notNull(),
		selectedCards: jsonb('selected_cards').notNull().default(sql`'[]'::jsonb`),
		selectedClusters: jsonb('selected_clusters').notNull().default(sql`'[]'::jsonb`),
		cacheHit: boolean('cache_hit').notNull().default(false),
		userAccepted: boolean('user_accepted'),
		correctionLabel: text('correction_label'),
		reward: real('reward'),
		metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		runIdIdx: index('idx_intent_eval_runs_run_id').on(t.runId),
		predictedIntentIdx: index('idx_intent_eval_runs_predicted_intent').on(t.predictedIntent),
	})
);

export type IntentEvalRun = typeof intentEvalRuns.$inferSelect;
export type NewIntentEvalRun = typeof intentEvalRuns.$inferInsert;
