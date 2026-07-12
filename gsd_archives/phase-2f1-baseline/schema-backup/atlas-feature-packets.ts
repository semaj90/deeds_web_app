import { sql } from 'drizzle-orm';
import { pgTable, text, integer, jsonb, timestamp, index, uuid, doublePrecision, real } from 'drizzle-orm/pg-core';
import { atlasTreeNodes } from './atlas-tree-nodes.js';

export const atlasFeaturePackets = pgTable('atlas_feature_packets', {
  packetKey: text('packet_key').primaryKey(),
  sourceRef: text('source_ref').notNull(),
  featureId: text('feature_id').notNull(),
  featureLabel: text('feature_label').notNull(),
  packetType: text('packet_type').notNull(),
  communityId: integer('community_id'),
  communitySource: text('community_source'),
  communityConfidence: doublePrecision('community_confidence'),
  filePath: text('file_path'),
  treeNodeId: uuid('tree_node_id').references(() => atlasTreeNodes.nodeId, { onDelete: 'set null' }),
  somCluster: integer('som_cluster'),
  permissions: jsonb('permissions').default(sql`'{}'::jsonb`).notNull(),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  topology: jsonb('topology').default(sql`'{}'::jsonb`).notNull(),
  vectors: jsonb('vectors').default(sql`'{}'::jsonb`).notNull(),
  pagerank: real('pagerank'),
  betweenness: real('betweenness'),
  eigenvector: real('eigenvector'),
  lineageVersion: text('lineage_version').notNull().default('packet-identity-v2'),
  ledgerType: text('ledger_type').notNull().default('atlas:feature'),
  neo4jNodeId: text('neo4j_node_id'),
  redisCentroidKey: text('redis_centroid_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sourceRefIdx: index('idx_atlas_feature_source_ref').on(table.sourceRef),
  featureIdIdx: index('idx_atlas_feature_feature_id').on(table.featureId),
  packetTypeIdx: index('idx_atlas_feature_type').on(table.packetType),
  lineageIdx: index('idx_atlas_feature_lineage').on(table.lineageVersion),
  permissionsGinIdx: index('idx_atlas_feature_permissions').using('gin', table.permissions),
  metadataGinIdx: index('idx_atlas_feature_metadata').using('gin', table.metadata),
  topologyGinIdx: index('idx_atlas_feature_topology').using('gin', table.topology),
  vectorsGinIdx: index('idx_atlas_feature_vectors').using('gin', table.vectors),
  pagerankIdx: index('idx_atlas_feature_pagerank').on(table.pagerank),
  betweennessIdx: index('idx_atlas_feature_betweenness').on(table.betweenness),
  eigenvectorIdx: index('idx_atlas_feature_eigenvector').on(table.eigenvector),
  filePathIdx: index('idx_atlas_feature_file_path').on(table.filePath),
  treeNodeIdIdx: index('idx_atlas_feature_tree_node_id').on(table.treeNodeId),
  somClusterIdx: index('idx_atlas_feature_som_cluster').on(table.somCluster),
  neo4jNodeIdIdx: index('idx_atlas_feature_neo4j_node_id').on(table.neo4jNodeId),
  redisCentroidKeyIdx: index('idx_atlas_feature_redis_centroid_key').on(table.redisCentroidKey),
  featureSourceIdx: index('idx_atlas_feature_feature_source').on(table.featureId, table.sourceRef),
  identityIdx: index('atlas_feature_packets_identity_idx').on(table.packetKey, table.sourceRef, table.featureId),
  somTreeIdx: index('idx_atlas_feature_tree_som_cluster')
    .on(table.treeNodeId, table.somCluster)
    .where(sql`${table.treeNodeId} IS NOT NULL AND ${table.somCluster} IS NOT NULL`),
}));

export type AtlasFeaturePackets = typeof atlasFeaturePackets.$inferSelect;
export type NewAtlasFeaturePackets = typeof atlasFeaturePackets.$inferInsert;

