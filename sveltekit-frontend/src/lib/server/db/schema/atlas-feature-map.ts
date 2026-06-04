import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Canonical source_ref → feature lineage table.
 * One truth, many projections: joins Qdrant, Neo4j, NES, and SOM into one row.
 */
export const atlasFeatureMap = pgTable('atlas_feature_map', {
  normalizedPath:     text('normalized_path').primaryKey(),
  sourceRef:          text('source_ref'),
  featureId:          text('feature_id'),
  relatedFeatureIds:  jsonb('related_feature_ids').notNull().default(sql`'[]'::jsonb`),
  clusterId:          text('cluster_id'),
  centroidId:         text('centroid_id'),
  somCluster:         text('som_cluster'),
  qdrantPointId:      text('qdrant_point_id'),
  neo4jNodeId:        text('neo4j_node_id'),
  nesCardId:          text('nes_card_id'),
  laneIds:            text('lane_ids').array().notNull().default(sql`'{}'::text[]`),
  atlasVersion:       integer('atlas_version').notNull().default(1),
  indexedAt:          timestamp('indexed_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  featureIdIdx:       index('atlas_feature_map_feature_id_idx').on(table.featureId),
  somClusterIdx:      index('atlas_feature_map_som_cluster_idx').on(table.somCluster),
  clusterIdIdx:       index('atlas_feature_map_cluster_id_idx').on(table.clusterId),
  relatedGin:         index('atlas_feature_map_related_gin').using('gin', table.relatedFeatureIds),
  laneIdsGin:         index('atlas_feature_map_lane_ids_gin').using('gin', table.laneIds),
}));

export type AtlasFeatureMap = typeof atlasFeatureMap.$inferSelect;
export type NewAtlasFeatureMap = typeof atlasFeatureMap.$inferInsert;
