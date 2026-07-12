import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { atlasTreeNodes } from './atlas-tree-nodes.js';

/**
 * Canonical source_ref → feature lineage table.
 * One truth, many projections: joins Qdrant, Neo4j, NES, and SOM into one row.
 */
export const atlasFeatureMap = pgTable('atlas_feature_map', {
  normalizedPath:     text('normalized_path').primaryKey(),
  sourceRef:          text('source_ref'),
  featureId:          text('feature_id'),
  featureLabel:       text('feature_label'),
  canonicalName:      text('canonical_name'),
  relatedFeatureIds:  jsonb('related_feature_ids').notNull().default(sql`'[]'::jsonb`),
  clusterId:          text('cluster_id'),
  centroidId:         text('centroid_id'),
  somCluster:         text('som_cluster'),
  communityId:        integer('community_id'),
  somBmuRow:          integer('som_bmu_row'),
  somBmuCol:          integer('som_bmu_col'),
  treeNodeId:         uuid('tree_node_id').references(() => atlasTreeNodes.nodeId, { onDelete: 'set null' }),
  qdrantPointId:      text('qdrant_point_id'),
  qdrantPointIds:     jsonb('qdrant_point_ids').notNull().default(sql`'[]'::jsonb`),
  neo4jNodeId:        text('neo4j_node_id'),
  neo4jNodeIds:       jsonb('neo4j_node_ids').notNull().default(sql`'[]'::jsonb`),
  nesCardId:          text('nes_card_id'),
  packetKeys:         jsonb('packet_keys').notNull().default(sql`'[]'::jsonb`),
  packetId:           text('packet_id'),
  filePath:           text('file_path'),
  sourceRefs:         jsonb('source_refs').notNull().default(sql`'[]'::jsonb`),
  metadata:           jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  summary:            text('summary'),
  pagerank:           text('pagerank'),
  centrality:         text('centrality'),
  updatedAt:          timestamp('updated_at', { withTimezone: true }).defaultNow(),
  laneIds:            text('lane_ids').array().notNull().default(sql`'{}'::text[]`),
  atlasVersion:       integer('atlas_version').notNull().default(1),
  indexedAt:          timestamp('indexed_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  featureIdIdx:       index('atlas_feature_map_feature_id_idx').on(table.featureId),
  featureIdAliasIdx:  index('idx_atlas_feature_map_feature_id').on(table.featureId),
  liveFeatureIdIdx:   index('afm_feature_id_idx').on(table.featureId),
  communityIdIdx:     index('afm_community_id_idx').on(table.communityId),
  sourceRefIdx:       index('idx_atlas_feature_map_source_ref').on(table.sourceRef),
  packetIdIdx:        index('atlas_feature_map_packet_id_idx').on(table.packetId).where(sql`${table.packetId} IS NOT NULL`),
  somClusterIdx:      index('atlas_feature_map_som_cluster_idx').on(table.somCluster),
  clusterIdIdx:       index('atlas_feature_map_cluster_id_idx').on(table.clusterId),
  pagerankIdx:        index('afm_pagerank_idx').on(table.pagerank),
  metadataGin:        index('idx_atlas_feature_map_metadata_gin').using('gin', table.metadata),
  qdrantPointIdsGin:  index('idx_atlas_feature_map_qdrant_point_ids_gin').using('gin', table.qdrantPointIds),
  neo4jNodeIdsGin:    index('idx_atlas_feature_map_neo4j_node_ids_gin').using('gin', table.neo4jNodeIds),
  packetKeysGin:      index('idx_atlas_feature_map_packet_keys_gin').using('gin', table.packetKeys),
  sourceRefsGin:      index('idx_atlas_feature_map_source_refs_gin').using('gin', table.sourceRefs),
  treeNodeIdIdx:      index('atlas_feature_map_tree_node_id_idx').on(table.treeNodeId),
  relatedGin:         index('atlas_feature_map_related_gin').using('gin', table.relatedFeatureIds),
  laneIdsGin:         index('atlas_feature_map_lane_ids_gin').using('gin', table.laneIds),
}));

export type AtlasFeatureMap = typeof atlasFeatureMap.$inferSelect;
export type NewAtlasFeatureMap = typeof atlasFeatureMap.$inferInsert;
