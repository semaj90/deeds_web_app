import { pgTable, serial, text, integer, real, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const atlasSourceRefDict = pgTable('atlas_source_ref_dict', {
  id:        serial('id').primaryKey(),
  sourceRef: text('source_ref').notNull().unique(),
  indexedAt: timestamp('indexed_at', { withTimezone: true }).defaultNow(),
});

export const atlasFeatureDict = pgTable('atlas_feature_dict', {
  id:        serial('id').primaryKey(),
  featureId: text('feature_id').notNull().unique(),
  indexedAt: timestamp('indexed_at', { withTimezone: true }).defaultNow(),
});

export const atlasLaneDict = pgTable('atlas_lane_dict', {
  id:        serial('id').primaryKey(),
  laneId:    text('lane_id').notNull().unique(),
  indexedAt: timestamp('indexed_at', { withTimezone: true }).defaultNow(),
});

export type AtlasSourceRefDict = typeof atlasSourceRefDict.$inferSelect;
export type AtlasFeatureDict   = typeof atlasFeatureDict.$inferSelect;
export type AtlasLaneDict      = typeof atlasLaneDict.$inferSelect;
export type NewAtlasSourceRefDict = typeof atlasSourceRefDict.$inferInsert;
export type NewAtlasFeatureDict   = typeof atlasFeatureDict.$inferInsert;
export type NewAtlasLaneDict      = typeof atlasLaneDict.$inferInsert;

// ── Atlas feature synthesis (aggregated by feature_id) ──────────────────────
export const atlasFeatureSynthesis = pgTable('atlas_feature_synthesis', {
  id:                serial('id').primaryKey(),
  feature_id:        text('feature_id').notNull().unique(),
  packet_count:      integer('packet_count').notNull().default(0),
  atlas_file_count:  integer('atlas_file_count').notNull().default(0),
  qdrant_point_count:integer('qdrant_point_count').notNull().default(0),
  avg_confidence:    real('avg_confidence'),
  max_confidence:    real('max_confidence'),
  semantic_confidence: real('semantic_confidence'),
  behavior_score:    real('behavior_score'),
  primary_cluster_id: text('primary_cluster_id'),
  primary_centroid_id: text('primary_centroid_id'),
  cluster_ids:       jsonb('cluster_ids').$type<string[]>().notNull().default([]),
  top_file_paths:    jsonb('top_file_paths').$type<string[]>().notNull().default([]),
  source_refs:       jsonb('source_refs').$type<string[]>().notNull().default([]),
  synthesized_summary: text('synthesized_summary'),
  next_actions:      jsonb('next_actions').$type<string[]>().notNull().default([]),
  dominant_status:   text('dominant_status').notNull().default('todo'),
  has_blocked:       boolean('has_blocked').notNull().default(false),
  atlas_version:     text('atlas_version'),
  synthesized_at:    timestamp('synthesized_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at:        timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  clusterIdx:  index('idx_atlas_feature_synthesis_cluster_id').on(t.primary_cluster_id),
  synthAtIdx:  index('idx_atlas_feature_synthesis_synthesized_at').on(t.synthesized_at),
}));

// ── Atlas source-ref synthesis (populated from Qdrant + Karpathy, not packets) ──
export const atlasSourceRefSynthesis = pgTable('atlas_source_ref_synthesis', {
  id:               serial('id').primaryKey(),
  source_ref:       text('source_ref').notNull().unique(),
  source_kind:      text('source_kind').notNull().default('file'),
  feature_id:       text('feature_id'),
  atlas_rank:       real('atlas_rank'),
  atlas_authority:  real('atlas_authority'),
  karpathy_blend:   real('karpathy_blend'),
  pagerank_score:   real('pagerank_score'),
  attention_score:  real('attention_score'),
  qdrant_point_ids: jsonb('qdrant_point_ids').$type<string[]>().notNull().default([]),
  cluster_ids:      jsonb('cluster_ids').$type<string[]>().notNull().default([]),
  som_cluster:      text('som_cluster'),
  synthesized_summary: text('synthesized_summary'),
  synthesized_at:   timestamp('synthesized_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at:       timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  featureIdx:   index('idx_atlas_source_ref_synthesis_feature_id').on(t.feature_id),
  karpathyIdx:  index('idx_atlas_source_ref_synthesis_karpathy').on(t.karpathy_blend),
}));

export type AtlasFeatureSynthesis = typeof atlasFeatureSynthesis.$inferSelect;
export type AtlasSourceRefSynthesis = typeof atlasSourceRefSynthesis.$inferSelect;
export type NewAtlasFeatureSynthesis = typeof atlasFeatureSynthesis.$inferInsert;
export type NewAtlasSourceRefSynthesis = typeof atlasSourceRefSynthesis.$inferInsert;
