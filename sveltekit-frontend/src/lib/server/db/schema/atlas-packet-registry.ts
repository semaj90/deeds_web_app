import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { atlasPackets } from './atlas-packets.js';

/**
 * Additive Drizzle schema for the RPC Packet Registry projection metadata.
 * Models projection descriptor attachments without altering atlas_packets.
 * Read-only reflection; do not apply live DDL until an explicit migration is authorized.
 */
export const atlasPacketRegistryProjections = pgTable(
  'atlas_packet_registry_projections',
  {
    projectionId: text('projection_id').primaryKey(),
    packetKey: text('packet_key').notNull().references(() => atlasPackets.packetKey),
    laneId: text('lane_id').notNull(),
    kind: text('kind').notNull(),
    owner: text('owner').notNull(),
    status: text('status').notNull().default('UNPROVEN'),
    representationId: text('representation_id'),
    representationRevision: text('representation_revision'),
    modelRevision: text('model_revision'),
    collection: text('collection'),
    vectorName: text('vector_name'),
    tags: jsonb('tags').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    indexAlgorithm: text('index_algorithm').notNull().default('NONE'),
    indexRevision: text('index_revision'),
    projectionChecksum: text('projection_checksum'),
    writePolicy: text('write_policy').notNull().default('PROJECTION_ONLY'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    packetKeyIdx: index('idx_atlas_packet_reg_proj_packet_key').on(table.packetKey),
    laneIdIdx: index('idx_atlas_packet_reg_proj_lane_id').on(table.laneId),
    statusIdx: index('idx_atlas_packet_reg_proj_status').on(table.status),
  })
);

export type AtlasPacketRegistryProjection = typeof atlasPacketRegistryProjections.$inferSelect;
export type NewAtlasPacketRegistryProjection = typeof atlasPacketRegistryProjections.$inferInsert;
