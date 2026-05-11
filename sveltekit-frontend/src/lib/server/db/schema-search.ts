import { pgTable, uuid, text, integer, varchar, timestamp, jsonb, vector, real, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './schema-postgres.js';

/**
 * Stores results from enhanced Ripgrep (rg) searches.
 * This acts as the 'index' for GPU-accelerated semantic analysis.
 */
export const rgSearchResults = pgTable('rg_search_results', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	/** Unique ID for the search execution run (e.g. rg-1715442000000-abcd) */
	timestampId: varchar('timestamp_id', { length: 256 }).notNull(),
	query: text('query').notNull(),
	filePath: text('file_path').notNull(),
	lineNumber: integer('line_number').notNull(),
	columnNumber: integer('column_number').notNull(),
	content: text('content').notNull(),
	/** 768-dim embedding generated via embeddinggemma */
	embedding: vector('embedding', { dimensions: 768 }),
	/** Semantic tags assigned via GPU Karpathy Loop */
	semanticTags: jsonb('semantic_tags').default([]).$type<string[]>(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Stores centroid clusters for multi-query research sessions.
 */
export const searchCentroids = pgTable('search_centroids', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	runId: varchar('run_id', { length: 256 }).notNull(),
	queries: jsonb('queries').notNull().$type<string[]>(),
	centroidVector: vector('centroid_vector', { dimensions: 768 }).notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Stores individual search execution runs for the RG-Atlas pipeline.
 */
export const rgSearchRuns = pgTable('rg_search_runs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  /** rg_<unix_ms>_<uuid8> — human-readable timestamp + UUID prefix */
  runKey: varchar('run_key', { length: 64 }).notNull().unique(),
  query: text('query').notNull(),
  args: jsonb('args').notNull().default(sql`'{}'::jsonb`),
  diagnostics: jsonb('diagnostics').notNull().default(sql`'{}'::jsonb`),
  /** Set when stage 5 clustering completes; null otherwise */
  clusterCount: integer('cluster_count'),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('rg_runs_user_created').on(t.userId, t.createdAt),
  index('rg_runs_runkey').on(t.runKey),
]);

/**
 * Stores individual ranked hits within a search run.
 */
export const rgSearchHits = pgTable('rg_search_hits', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid('run_id').notNull().references(() => rgSearchRuns.id, { onDelete: 'cascade' }),
  filePath: text('file_path').notNull(),
  lineNumber: integer('line_number'),
  snippet: text('snippet'),
  source: varchar('source', { length: 16 }).notNull(),  // 'rg' | 'qdrant' | 'union'
  /** Per-stage scores — JSONB so weights can evolve without schema changes */
  scores: jsonb('scores').notNull().default(sql`'{}'::jsonb`),
  /** Final weighted score — the sort key, indexed */
  finalScore: real('final_score').notNull().default(0),
  clusterId: integer('cluster_id'),
  /** LangExtract grounded entities (offset, type, text) */
  entities: jsonb('entities').notNull().default(sql`'[]'::jsonb`),
  rank: integer('rank').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('rg_hits_run_rank').on(t.runId, t.rank),
  index('rg_hits_final_score').on(t.finalScore),
  index('rg_hits_cluster').on(t.clusterId),
]);

export type RgSearchRun = typeof rgSearchRuns.$inferSelect;
export type RgSearchHit = typeof rgSearchHits.$inferSelect;
