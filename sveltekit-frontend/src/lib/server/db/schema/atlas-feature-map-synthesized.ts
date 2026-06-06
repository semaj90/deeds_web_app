import { index, integer, jsonb, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Derived working memory for Atlas promotion.
 *
 * This mirrors the manual SQL materialization that joins atlas_feature_map,
 * task_semantic_packets, and agent_pickup_queue state.
 */
export const atlasFeatureMapSynthesized = pgTable('atlas_feature_map_synthesized', {
  sourceRef: text('source_ref').primaryKey(),
  featureId: text('feature_id'),
  relatedFeatureIds: jsonb('related_feature_ids').notNull().default(sql`'[]'::jsonb`),

  somCluster: text('som_cluster'),
  centroidId: text('centroid_id'),
  qdrantPointId: text('qdrant_point_id'),
  clusterId: text('cluster_id'),

  taskCount: integer('task_count').notNull().default(0),
  packetCount: integer('packet_count').notNull().default(0),
  readyPacketCount: integer('ready_packet_count').notNull().default(0),
  lastPacketId: text('last_packet_id'),
  pickupStatus: text('pickup_status'),

  semanticConfidence: real('semantic_confidence'),
  graphDistance: integer('graph_distance'),
  behaviorScore: real('behavior_score'),
  testScore: real('test_score'),
  routingScore: real('routing_score'),

  runtimeState: jsonb('runtime_state').notNull().default(sql`'{}'::jsonb`),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }).notNull().defaultNow(),
  synthesizedAt: timestamp('synthesized_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  featureIdIdx: index('idx_afms_feature_id').on(table.featureId),
  somClusterIdx: index('idx_afms_som_cluster').on(table.somCluster),
  routingScoreIdx: index('idx_afms_routing_score').on(table.routingScore.desc()),
  pickupStatusIdx: index('idx_afms_pickup_status').on(table.pickupStatus).where(sql`${table.pickupStatus} IS NOT NULL`),
}));

export type AtlasFeatureMapSynthesized = typeof atlasFeatureMapSynthesized.$inferSelect;
export type NewAtlasFeatureMapSynthesized = typeof atlasFeatureMapSynthesized.$inferInsert;
