import { sql } from 'drizzle-orm';
import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, bigserial } from 'drizzle-orm/pg-core';

export const retrievalTelemetry = pgTable('retrieval_telemetry', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  query: text('query').notNull(),
  queryHash: text('query_hash').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  vectorHits: integer('vector_hits').notNull().default(0),
  trigramHits: integer('trigram_hits').notNull().default(0),
  ftsHits: integer('fts_hits').notNull().default(0),
  selectedPacketKey: text('selected_packet_key'),
  selectedPacketKeys: jsonb('selected_packet_keys').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  selectedFeatureId: text('selected_feature_id'),
  featureIds: jsonb('feature_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  fusionScore: doublePrecision('fusion_score'),
  cacheHit: boolean('cache_hit').notNull().default(false),
  surface: text('surface').notNull(),
  environment: text('environment').notNull(),
  retrievalStrategy: text('retrieval_strategy').notNull().default('hybrid'),
}, (table) => ({
  createdAtIdx: index('idx_retrieval_telemetry_created_at').on(table.createdAt),
  queryHashIdx: index('idx_retrieval_telemetry_query_hash').on(table.queryHash),
  selectedPacketKeysGin: index('idx_retrieval_telemetry_selected_packet_keys_gin').using('gin', table.selectedPacketKeys),
  featureIdsGin: index('idx_retrieval_telemetry_feature_ids_gin').using('gin', table.featureIds),
  latencyMsIdx: index('idx_retrieval_telemetry_latency_ms').on(table.latencyMs),
  strategyIdx: index('idx_retrieval_telemetry_strategy').on(table.retrievalStrategy),
  surfaceIdx: index('idx_retrieval_telemetry_surface').on(table.surface),
  environmentIdx: index('idx_retrieval_telemetry_environment').on(table.environment),
}));

export type RetrievalTelemetry = typeof retrievalTelemetry.$inferSelect;
export type NewRetrievalTelemetry = typeof retrievalTelemetry.$inferInsert;
