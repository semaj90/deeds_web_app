import { sql } from 'drizzle-orm';
import {
  pgTable, text, integer, doublePrecision, bigint, jsonb,
  timestamp, index, uuid, boolean,
} from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';

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
  packetId: uuid('packet_id').primaryKey().defaultRandom(),
  packetKey: text('packet_key').notNull(),
  sourceRef: text('source_ref').notNull(),
  directoryPath: text('directory_path').notNull(),
  filePath: text('file_path'),
  functionSymbol: text('function_symbol'),
  featureId: text('feature_id').notNull(),
  featureLabel: text('feature_label').notNull(),

  // Community / topology
  communityId: integer('community_id'),
  communitySource: text('community_source'),
  communityConfidence: doublePrecision('community_confidence').default(0),
  conceptIds: text('concept_ids').array().default(sql`'{}'::text[]`),
  clusterId: integer('cluster_id'),

  // Vector
  embedding: vector('embedding', { dimensions: 768 }),

  // Content
  payload: jsonb('payload').default(sql`'{}'::jsonb`),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
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
  directoryIdx: index('idx_atlas_packets_directory_path').on(table.directoryPath),
  directoryFeatureIdx: index('idx_atlas_packets_directory_feature').on(table.directoryPath, table.featureId),
  featureIdIdx: index('idx_atlas_packets_cluster_id').on(table.clusterId),
  payloadGin: index('idx_atlas_packets_payload_gin').using('gin', table.payload),
  identityLaneIdx: index('idx_atlas_packets_identity_lane').on(table.identityLane),
  qdrantPointIdIdx: index('idx_atlas_packets_qdrant_point_id').on(table.qdrantPointId),
  rewardPriorIdx: index('idx_atlas_packets_reward_prior').on(sql`${table.rewardPrior} DESC`),
  communityConfIdx: index('idx_atlas_packets_community_confidence').on(sql`${table.communityConfidence} DESC`),
  updatedAtIdx: index('idx_atlas_packets_updated_at').on(sql`${table.updatedAt} DESC`),
  createdAtIdx: index('idx_atlas_packets_created_at').on(sql`${table.createdAt} DESC`),
}));

export type AtlasPacket = typeof atlasPackets.$inferSelect;
export type NewAtlasPacket = typeof atlasPackets.$inferInsert;
