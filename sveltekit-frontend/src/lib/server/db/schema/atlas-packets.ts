import { sql } from 'drizzle-orm';
import {
  pgTable, text, integer, doublePrecision, bigint, jsonb,
  timestamp, index, uuid, boolean, real, customType,
} from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';
import { atlasTreeNodes } from './atlas-tree-nodes.js';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
  fromDriver(value) {
    return value as Buffer;
  },
  toDriver(value) {
    return value;
  },
});

// identity_lane values (explicit set — not a DB enum to stay migration-free)
export type AtlasIdentityLane =
  | 'qdrant_chunk'
  | 'mcp_tool_stub'
  | 'tree_node'
  | 'glyph_record'
  | 'neo4j_node'
  | 'redis_hot_key';

export const atlasPackets = pgTable('atlas_packets', {
  // Primary identity spine (canonical — Postgres is truth)
  packetId: text('packet_id').primaryKey(),
  packetUlid: text('packet_ulid'),
  packetKey: text('packet_key'),
  artifactId: text('artifact_id'),
  // col 2: populated in 58,304/61,659 rows by ingest-qdrant-to-atlas-packets.mjs
  sourceRef: text('source_ref').notNull(),
  canonicalSourceRef: text('canonical_source_ref'),
  directoryPath: text('directory_path').notNull(),
  filePath: text('file_path'),
  functionSymbol: text('function_symbol'),
  featureId: text('feature_id').notNull(),
  featureLabel: text('feature_label').notNull(),
  titleId: text('title_id'),

  // Community / topology
  communityId: integer('community_id'),
  communitySource: text('community_source'),
  communityConfidence: doublePrecision('community_confidence').default(0),
  conceptIds: text('concept_ids').array().default(sql`'{}'::text[]`),
  clusterId: integer('cluster_id'),

  // Vector
  embedding: vector('embedding', { dimensions: 768 }),

  // Content
  permissions: jsonb('permissions').default(sql`'{}'::jsonb`).notNull(),
  payload: jsonb('payload').default(sql`'{}'::jsonb`),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
  topology: jsonb('topology').default(sql`'{}'::jsonb`).notNull(),
  vectors: jsonb('vectors').default(sql`'{}'::jsonb`).notNull(),
  summary: text('summary'),
  byteStart: bigint('byte_start', { mode: 'number' }),
  byteEnd: bigint('byte_end', { mode: 'number' }),
  sha256: text('sha256'),

  // Source classification
  sourceKind: text('source_kind').default('codebase'),
  sourcePath: text('source_path'),
  sourceRefKey: text('source_ref_key'),

  // Scoring
  rewardPrior: doublePrecision('reward_prior').default(0),
  pagerank: real('pagerank'),
  betweenness: real('betweenness'),
  eigenvector: real('eigenvector'),
  neo4jNodeId: text('neo4j_node_id'),
  treeNodeId: uuid('tree_node_id').references(() => atlasTreeNodes.nodeId, { onDelete: 'set null' }),
  redisCentroidKey: text('redis_centroid_key'),
  domainClass: text('domain_class'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  lineageVersion: text('lineage_version'),
  ledgerType: text('ledger_type'),
  canonical: boolean('canonical'),
  payloadBackfilledAt: timestamp('payload_backfilled_at', { withTimezone: true }),

  // SOM topology
  somRow: integer('som_row'),
  somCol: integer('som_col'),
  somIndex: integer('som_index'),
  kmeansCluster: integer('kmeans_cluster'),
  latent64: bytea('latent_64'),

  // Phase 110: Workspace-scoped caching + representation versioning
  workspaceId: text('workspace_id'),
  // Workspace identity for cache scoping (can be null for legacy packets)

  workspaceRevision: integer('workspace_revision').notNull().default(0),
  // Incremented by operator when embedding model changes. Used in cache key.
  // Cache stale rejection: if current workspace_revision > cached, skip cache.

  representationRevision: integer('representation_revision').notNull().default(0),
  // Tracks representation contract version (e.g., v1 = 384d, v2 = 768d).
  // Prevents 384d vectors being re-used when schema upgrades to 768d.

  // Representation lineage (cols 135-140 in live DB)
  // source_representation_id: lane constant for raw embedding (e.g. 'semantic_768')
  // projection_representation_id: lane constant for compressed projection (e.g. 'latent_64')
  // Actively read/written by feature-tracking-layer.ts and trace-reranker.ts.
  sourceRepresentationId: text('source_representation_id'),
  sourceDimension: integer('source_dimension'),
  projectionRepresentationId: text('projection_representation_id'),
  projectionDimension: integer('projection_dimension'),
  encoderRevision: text('encoder_revision'),
  somRevision: text('som_revision'),

  embeddingDigest: text('embedding_digest'),
  // SHA-256 of embedding vector (hex string). Immutable anchor.
  // Computed once at insert; used for idempotency verification and cold-storage manifest.

  // Identity lane — which topology this packet belongs to
  // qdrant_chunk: vector-backed, qdrant_point_id is set
  // mcp_tool_stub: MCP tool registration, no vector
  // tree_node / glyph_record / neo4j_node / redis_hot_key: non-vector identities
  identityLane: text('identity_lane').$type<AtlasIdentityLane>().default('qdrant_chunk'),
  qdrantPointId: text('qdrant_point_id'),
  qdrantCollection: text('qdrant_collection'),
  qdrantVectorDim: integer('qdrant_vector_dim'),
  identityConfidence: doublePrecision('identity_confidence').default(1.0),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  identityIdx: index('idx_atlas_packets_identity').on(table.packetKey, table.sourceRef, table.featureId, table.directoryPath),
  sourceRefIdx: index('idx_atlas_packets_source_feature').on(table.sourceRef, table.featureId),
  packetUlidIdx: index('idx_atlas_packets_packet_ulid').on(table.packetUlid),
  titleIdIdx: index('idx_atlas_packets_title_id').on(table.titleId),
  canonicalSourceRefIdx: index('idx_atlas_packets_canonical_source_ref').on(table.canonicalSourceRef),
  directoryIdx: index('idx_atlas_packets_directory_path').on(table.directoryPath),
  directoryFeatureIdx: index('idx_atlas_packets_directory_feature').on(table.directoryPath, table.featureId),
  clusterIdIdx: index('idx_atlas_packets_cluster_id').on(table.clusterId),
  permissionsGin: index('idx_atlas_packets_permissions_gin').using('gin', table.permissions),
  payloadGin: index('idx_atlas_packets_payload_gin').using('gin', table.payload),
  metadataGin: index('idx_atlas_packets_metadata_gin').using('gin', table.metadata),
  topologyGin: index('idx_atlas_packets_topology_gin').using('gin', table.topology),
  vectorsGin: index('idx_atlas_packets_vectors_gin').using('gin', table.vectors),
  identityLaneIdx: index('idx_atlas_packets_identity_lane').on(table.identityLane),
  qdrantPointIdIdx: index('idx_atlas_packets_qdrant_point_id').on(table.qdrantPointId),
  pagerankIdx: index('idx_atlas_packets_pagerank').on(table.pagerank),
  betweennessIdx: index('idx_atlas_packets_betweenness').on(table.betweenness),
  eigenvectorIdx: index('idx_atlas_packets_eigenvector').on(table.eigenvector),
  neo4jNodeIdIdx: index('idx_atlas_packets_neo4j_node_id').on(table.neo4jNodeId),
  treeNodeIdIdx: index('idx_atlas_packets_tree_node_id').on(table.treeNodeId),
  redisCentroidKeyIdx: index('idx_atlas_packets_redis_centroid_key').on(table.redisCentroidKey),
  rewardPriorIdx: index('idx_atlas_packets_reward_prior').on(sql`${table.rewardPrior} DESC`),
  communityConfIdx: index('idx_atlas_packets_community_confidence').on(sql`${table.communityConfidence} DESC`),
  workspaceRevisionIdx: index('idx_atlas_packets_workspace_revision').on(table.workspaceRevision),
  representationRevisionIdx: index('idx_atlas_packets_representation_revision').on(table.representationRevision),
  embeddingDigestIdx: index('idx_atlas_packets_embedding_digest').on(table.embeddingDigest),
  updatedAtIdx: index('idx_atlas_packets_updated_at').on(sql`${table.updatedAt} DESC`),
  createdAtIdx: index('idx_atlas_packets_created_at').on(sql`${table.createdAt} DESC`),
}));

export type AtlasPacket = typeof atlasPackets.$inferSelect;
export type NewAtlasPacket = typeof atlasPackets.$inferInsert;

