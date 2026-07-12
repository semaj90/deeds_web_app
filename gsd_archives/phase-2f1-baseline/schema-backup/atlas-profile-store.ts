import { boolean, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const atlasProfileCards = pgTable('atlas_profile_cards', {
  cardId: text('card_id').primaryKey(),
  sourceRef: text('source_ref'),
  featureLabel: text('feature_label').notNull(),
  hotKeywords: text('hot_keywords').array().notNull().default(sql`'{}'::text[]`),
  dependencies: text('dependencies').array().notNull().default(sql`'{}'::text[]`),
  imports: text('imports').array().notNull().default(sql`'{}'::text[]`),
  exports: text('exports').array().notNull().default(sql`'{}'::text[]`),
  routes: text('routes').array().notNull().default(sql`'{}'::text[]`),
  mcpTools: text('mcp_tools').array().notNull().default(sql`'{}'::text[]`),
  dbTables: text('db_tables').array().notNull().default(sql`'{}'::text[]`),
  qdrantCollection: text('qdrant_collection'),
  redisKeys: text('redis_keys').array().notNull().default(sql`'{}'::text[]`),
  networkProtocols: text('network_protocols').notNull().default('unknown'),
  encodingProfile: text('encoding_profile').notNull().default('unknown'),
  missingGetters: text('missing_getters').array().notNull().default(sql`'{}'::text[]`),
  missingSetters: text('missing_setters').array().notNull().default(sql`'{}'::text[]`),
  missingLogs: text('missing_logs').array().notNull().default(sql`'{}'::text[]`),
  implementationStatus: text('implementation_status').notNull().default('candidate_complete'),
  nextAction: text('next_action'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  featureLabelIdx: index('idx_atlas_profile_cards_feature_label').on(table.featureLabel),
  sourceRefIdx: index('idx_atlas_profile_cards_source_ref').on(table.sourceRef),
}));

export const atlasFeatureProfiles = pgTable('atlas_feature_profiles', {
  featureLabel: text('feature_label').primaryKey(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  version: integer('version').notNull().default(1),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const atlasDependencyEdges = pgTable('atlas_dependency_edges', {
  id: serial('id').primaryKey(),
  sourceCardId: text('source_card_id').notNull().references(() => atlasProfileCards.cardId, { onDelete: 'cascade' }),
  targetCardId: text('target_card_id').notNull(),
  edgeType: text('edge_type').notNull().default('depends_on'),
  weight: doublePrecision('weight').notNull().default(1.0),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  sourceCardIdx: index('idx_atlas_dependency_edges_source_card_id').on(table.sourceCardId),
  targetCardIdx: index('idx_atlas_dependency_edges_target_card_id').on(table.targetCardId),
}));

export const atlasHotKeywordClusters = pgTable('atlas_hot_keyword_clusters', {
  clusterId: text('cluster_id').primaryKey(),
  hotKeywords: text('hot_keywords').array().notNull().default(sql`'{}'::text[]`),
  featureLabels: text('feature_labels').array().notNull().default(sql`'{}'::text[]`),
  topSourceRefs: text('top_source_refs').array().notNull().default(sql`'{}'::text[]`),
  dependencyEdges: text('dependency_edges').array().notNull().default(sql`'{}'::text[]`),
  recommendedCards: text('recommended_cards').array().notNull().default(sql`'{}'::text[]`),
  missingImplementation: text('missing_implementation').array().notNull().default(sql`'{}'::text[]`),
  nextAction: text('next_action'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const atlasRetrievalEvents = pgTable('atlas_retrieval_events', {
  id: serial('id').primaryKey(),
  query: text('query').notNull(),
  selectedCards: text('selected_cards').array().notNull().default(sql`'{}'::text[]`),
  droppedCards: text('dropped_cards').array().notNull().default(sql`'{}'::text[]`),
  sourceRefs: text('source_refs').array().notNull().default(sql`'{}'::text[]`),
  latencyMs: doublePrecision('latency_ms').notNull(),
  fallbackReason: text('fallback_reason'),
  missingNotes: text('missing_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  queryIdx: index('idx_atlas_retrieval_events_query').on(table.query),
}));

export type AtlasProfileCard = typeof atlasProfileCards.$inferSelect;
export type NewAtlasProfileCard = typeof atlasProfileCards.$inferInsert;
export type AtlasFeatureProfile = typeof atlasFeatureProfiles.$inferSelect;
export type NewAtlasFeatureProfile = typeof atlasFeatureProfiles.$inferInsert;
export type AtlasDependencyEdge = typeof atlasDependencyEdges.$inferSelect;
export type NewAtlasDependencyEdge = typeof atlasDependencyEdges.$inferInsert;
export type AtlasHotKeywordCluster = typeof atlasHotKeywordClusters.$inferSelect;
export type NewAtlasHotKeywordCluster = typeof atlasHotKeywordClusters.$inferInsert;
export type AtlasRetrievalEvent = typeof atlasRetrievalEvents.$inferSelect;
export type NewAtlasRetrievalEvent = typeof atlasRetrievalEvents.$inferInsert;
