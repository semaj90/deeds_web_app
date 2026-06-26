import { pgTable, text, integer, doublePrecision, jsonb, boolean, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Packet Topology Projection
 * Canonical derived topology/domain/SOM/manifold layer
 *
 * Bridges Postgres canonical packets (atlas_packets) to:
 * - Search/ranking dimensions (4D manifold)
 * - SOM grid coordinates (som_row, som_col)
 * - Community/topology labels
 * - Mirror join status (Qdrant, Redis, Neo4j)
 */
export const packetTopologyProjection = pgTable('packet_topology_projection', {
  // Identity spine (matches atlas_packets.packet_key)
  packetKey: text('packet_key').primaryKey().notNull(),
  featureId: text('feature_id').notNull(),
  sourceRef: text('source_ref'),
  domain: text('domain'),

  // Cluster identity
  clusterKey: text('cluster_key'),
  clusterId: integer('cluster_id'),
  kmeansCluster: integer('kmeans_cluster'),
  somCluster: integer('som_cluster'),

  // SOM grid coordinates
  somRow: integer('som_row'),
  somCol: integer('som_col'),

  // Community / topology labeling
  communityId: text('community_id'),
  topologyLabel: text('topology_label'),
  ontologyLabel: text('ontology_label'),

  // 4D Manifold Coordinates
  // x = semantic similarity (0.0-1.0)
  // y = graph/community position (0.0-1.0)
  // z = time/recency/lifecycle depth (0.0-1.0)
  // w = authority/confidence/rank (0.0-1.0)
  manifoldX: doublePrecision('manifold_x'),
  manifoldY: doublePrecision('manifold_y'),
  manifoldZ: doublePrecision('manifold_z'),
  manifoldW: doublePrecision('manifold_w'),

  // Mirror join status
  qdrantPointId: text('qdrant_point_id'),
  qdrantJoinable: boolean('qdrant_joinable').default(false),
  redisHotKey: text('redis_hot_key'),
  neo4jNodeKey: text('neo4j_node_key'),

  // Metadata envelope
  metadata: jsonb('metadata').default('{}'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  featureIdIdx: index('idx_ptp_feature_id').on(table.featureId),
  domainIdx: index('idx_ptp_domain').on(table.domain),
  clusterIdIdx: index('idx_ptp_cluster_id').on(table.clusterId),
  somIdx: index('idx_ptp_som').on(table.somRow, table.somCol),
  communityIdIdx: index('idx_ptp_community_id').on(table.communityId),
  qdrantPointIdx: index('idx_ptp_qdrant_point').on(table.qdrantPointId),
  metadataGin: index('idx_ptp_metadata_gin').using('gin', table.metadata),
}));

export type PacketTopologyProjection = typeof packetTopologyProjection.$inferSelect;
export type NewPacketTopologyProjection = typeof packetTopologyProjection.$inferInsert;

/**
 * Qdrant Orphan Points
 * Points that don't join to canonical Postgres spine
 * Used for audit and reconciliation workflows
 */
export const qdrantOrphanPoints = pgTable('qdrant_orphan_points', {
  pointId: text('point_id').primaryKey().notNull(),
  reason: text('reason'),
  payload: jsonb('payload').default('{}'),
  candidatePacketKey: text('candidate_packet_key'),
  candidateFeatureId: text('candidate_feature_id'),
  resolved: boolean('resolved').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  resolvedIdx: index('idx_qop_resolved').on(table.resolved),
  candidatePacketKeyIdx: index('idx_qop_candidate_packet_key').on(table.candidatePacketKey),
}));

export type QdrantOrphanPoint = typeof qdrantOrphanPoints.$inferSelect;
export type NewQdrantOrphanPoint = typeof qdrantOrphanPoints.$inferInsert;
