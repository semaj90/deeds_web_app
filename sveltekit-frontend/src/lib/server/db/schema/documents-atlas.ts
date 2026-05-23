import { pgTable, uuid, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Canonical document atlas used by deterministic sourceRef retrieval.
export const documentsAtlasEntries = pgTable('documents_atlas_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceRef: text('source_ref').notNull().unique(),
  path: text('path').notNull(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  summary: text('summary'),
  tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`),
  keywords: jsonb('keywords').notNull().default(sql`'[]'::jsonb`),
  protocols: jsonb('protocols').notNull().default(sql`'[]'::jsonb`),
  libraries: jsonb('libraries').notNull().default(sql`'[]'::jsonb`),
  languages: jsonb('languages').notNull().default(sql`'[]'::jsonb`),
  featureFamilies: jsonb('feature_families').notNull().default(sql`'[]'::jsonb`),
  headings: jsonb('headings').notNull().default(sql`'[]'::jsonb`),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export type DocumentsAtlasEntry = typeof documentsAtlasEntries.$inferSelect;
export type NewDocumentsAtlasEntry = typeof documentsAtlasEntries.$inferInsert;

// Feature mapping metadata for indexed code/doc artifacts.
export const featureIndexEntries = pgTable('feature_index_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  stableKey: text('stable_key').notNull().unique(),
  path: text('path').notNull(),
  programmingLanguage: text('programming_language').notNull(),
  featureFamily: text('feature_family').notNull(),
  labels: jsonb('labels').notNull().default(sql`'[]'::jsonb`),
  protocolDetected: jsonb('protocol_detected').notNull().default(sql`'[]'::jsonb`),
  routeKind: text('route_kind'),
  svelteKitRoute: text('sveltekit_route'),
  owningLibrary: text('owning_library'),
  exportedSymbols: jsonb('exported_symbols').notNull().default(sql`'[]'::jsonb`),
  importedSymbols: jsonb('imported_symbols').notNull().default(sql`'[]'::jsonb`),
  astRelations: jsonb('ast_relations').notNull().default(sql`'[]'::jsonb`),
  cacheSignals: jsonb('cache_signals').notNull().default(sql`'{}'::jsonb`),
  recommendation: jsonb('recommendation').notNull().default(sql`'{}'::jsonb`),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export type FeatureIndexEntry = typeof featureIndexEntries.$inferSelect;
export type NewFeatureIndexEntry = typeof featureIndexEntries.$inferInsert;

// Compact retrieval trace log for bounded cache observability.
export const retrievalCacheTraces = pgTable('retrieval_cache_traces', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: text('run_id').notNull().unique(),
  queryHash: text('query_hash').notNull(),
  packetId: text('packet_id'),
  hits: jsonb('hits').notNull().default(sql`'{}'::jsonb`),
  selected: jsonb('selected').notNull().default(sql`'{}'::jsonb`),
  tokenEstimate: integer('token_estimate'),
  toonBytes: integer('toon_bytes'),
  bifrostModelId: text('bifrost_model_id'),
  latencyMs: integer('latency_ms'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export type RetrievalCacheTrace = typeof retrievalCacheTraces.$inferSelect;
export type NewRetrievalCacheTrace = typeof retrievalCacheTraces.$inferInsert;
