import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  jsonb,
  timestamp,
  index,
  sql
} from 'drizzle-orm/pg-core';
import { atlasPackets } from './atlas-packets.js';

/**
 * Packet Topology Projection — Secondary spatial index for fast retrieval
 *
 * Purpose:
 * - Denormalize cluster/community/SOM assignments for O(1) lookups
 * - Enable parallel reranking by 4D manifold coordinates
 * - Support SOM neighborhood expansion (k-hop bounded)
 * - Cache Karpathy blend scores for fast sorting
 */

export const packetTopologyProjection = pgTable(
  'packet_topology_projection',
  {
    // Primary identity
    packetKey: text('packet_key').primaryKey().references(() => atlasPackets.packetKey, {
      onDelete: 'cascade'
    }),

    // Canonical identity fields (denormalized for JOIN efficiency)
    featureId: text('feature_id').notNull(),
    sourceRef: text('source_ref'),
    domain: text('domain'),

    // Cluster assignments
    clusterKey: text('cluster_key'),
    clusterId: integer('cluster_id'),
    kmeansCluster: integer('kmeans_cluster'),
    somCluster: integer('som_cluster'),
    somRow: integer('som_row'),
    somCol: integer('som_col'),

    // Graph topology
    communityId: text('community_id'),
    topologyLabel: text('topology_label'),
    ontologyLabel: text('ontology_label'),

    // 4D Manifold Coordinates (Karpathy reranking)
    manifoldX: doublePrecision('manifold_x'),
    manifoldY: doublePrecision('manifold_y'),
    manifoldZ: doublePrecision('manifold_z'),
    manifoldW: doublePrecision('manifold_w'),

    // Cross-store pointers
    qdrantPointId: text('qdrant_point_id'),
    qdrantJoinable: boolean('qdrant_joinable').default(false),
    redisHotKey: text('redis_hot_key'),
    neo4jNodeKey: text('neo4j_node_key'),

    // Metadata
    metadata: jsonb('metadata').default({}),

    // Audit timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
  },

  (table) => [
    index('idx_ptp_feature_id').on(table.featureId),
    index('idx_ptp_domain').on(table.domain),
    index('idx_ptp_som_grid').on(table.somRow, table.somCol),
    index('idx_ptp_community').on(table.communityId),
    index('idx_ptp_topology_label').on(table.topologyLabel),
    index('idx_ptp_qdrant_point').on(table.qdrantPointId),
    index('idx_ptp_cluster').on(table.clusterId, table.somRow, table.somCol),
    index('idx_ptp_updated_at').on(sql`${table.updatedAt} DESC`)
  ]
);

export type PacketTopologyProjection = typeof packetTopologyProjection.$inferSelect;
export type NewPacketTopologyProjection = typeof packetTopologyProjection.$inferInsert;

export function getSOMNeighborhoodQuery(row: number, col: number, radius: number = 1) {
  return {
    minRow: Math.max(0, row - radius),
    maxRow: Math.min(19, row + radius),
    minCol: Math.max(0, col - radius),
    maxCol: Math.min(19, col + radius)
  };
}

export function isValidManifoldCoordinates(
  x?: number | null,
  y?: number | null,
  z?: number | null,
  w?: number | null
): boolean {
  const isInRange = (val: number | null | undefined): boolean =>
    val === null || val === undefined || (val >= 0 && val <= 1);
  return isInRange(x) && isInRange(y) && isInRange(z) && isInRange(w);
}

export interface KarpathyBlendWeights {
  pageRank: number;
  attention: number;
  authority: number;
}

export const KARPATHY_BLEND_WEIGHTS: KarpathyBlendWeights = {
  pageRank: 0.4,
  attention: 0.3,
  authority: 0.3
};
