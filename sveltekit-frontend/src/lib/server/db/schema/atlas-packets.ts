import { pgTable, text, integer, doublePrecision, bigint, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';

export const atlasPackets = pgTable('atlas_packets', {
  packetId: text('packet_id').primaryKey(),
  packetKey: text('packet_key'),
  artifactId: text('artifact_id').notNull(),
  sourceRef: text('source_ref'),
  sourcePath: text('source_path'),
  sourceKind: text('source_kind'),
  featureId: text('feature_id'),
  communityId: integer('community_id'),
  conceptIds: text('concept_ids').array(),
  clusterId: integer('cluster_id'),
  embedding: vector('embedding', { dimensions: 768 }),
  payload: jsonb('payload'),
  metadata: jsonb('metadata'),
  summary: text('summary'),
  byteStart: bigint('byte_start', { mode: 'number' }),
  byteEnd: bigint('byte_end', { mode: 'number' }),
  sha256: text('sha256'),
  rewardPrior: doublePrecision('reward_prior').default(0),
  sourceRefKey: text('source_ref_key'),
  communitySource: text('community_source'),
  communityConfidence: doublePrecision('community_confidence'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  payloadGin: index('atlas_packets_payload_gin').using('gin', table.payload),
  featureIdx: index('atlas_packets_feature_idx').on(table.featureId, table.communityId, table.clusterId),
  sourceRefIdx: index('idx_atlas_packets_source_ref').on(table.sourceRef),
  packetKeyIdx: index('idx_atlas_packets_packet_key').on(table.packetKey),
  sourceKindIdx: index('idx_atlas_packets_source_kind').on(table.sourceKind),
}));
