import { pgTable, text, integer, bigint, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';

export const atlasPackets = pgTable('atlas_packets', {
  packetId: text('packet_id').primaryKey(),
  artifactId: text('artifact_id').notNull(),
  sourceRef: text('source_ref'),
  featureId: text('feature_id'),
  communityId: integer('community_id'),
  conceptIds: text('concept_ids').array(),
  clusterId: integer('cluster_id'),
  embedding: vector('embedding', { dimensions: 768 }),
  payload: jsonb('payload'),
  summary: text('summary'),
  byteStart: bigint('byte_start', { mode: 'number' }),
  byteEnd: bigint('byte_end', { mode: 'number' }),
  sha256: text('sha256'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, (table) => ({
  payloadGin: index('atlas_packets_payload_gin').using('gin', table.payload),
  featureIdx: index('atlas_packets_feature_idx').on(table.featureId, table.communityId, table.clusterId),
}));
