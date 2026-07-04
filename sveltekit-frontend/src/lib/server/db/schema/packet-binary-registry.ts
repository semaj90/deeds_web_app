import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid, customType } from 'drizzle-orm/pg-core';

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

/**
 * Temporary binary packet registry.
 *
 * Purpose:
 * - queue/dequeue binary packet envelopes
 * - hold DAG-hit snapshots for open-memory routing
 * - keep the canonical Postgres packet row separate from transient transport blobs
 *
 * Canonical identity:
 * - packet_key is the stable lookup key
 * - packet_id remains the Postgres row identity
 * - packet_ulid is optional ordering lineage
 */
export const packetBinaryRegistry = pgTable('packet_binary_registry', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  packetKey: text('packet_key').notNull(),
  packetId: uuid('packet_id').notNull(),
  packetUlid: text('packet_ulid'),
  titleId: text('title_id').notNull(),
  featureId: text('feature_id').notNull(),
  sourceRef: text('source_ref').notNull(),
  communityId: integer('community_id'),
  somRow: integer('som_row'),
  somCol: integer('som_col'),
  transportType: text('transport_type').notNull().default('grpc'),
  payloadFormat: text('payload_format').notNull().default('protobuf'),
  binaryPayload: bytea('binary_payload').notNull(),
  payloadHash: text('payload_hash'),
  ttlSeconds: integer('ttl_seconds').notNull().default(3600),
  dagHitKind: text('dag_hit_kind').default('open_memory'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
}, (table) => ({
  packetKeyUq: uniqueIndex('uq_packet_binary_registry_packet_key').on(table.packetKey),
  packetIdIdx: index('idx_packet_binary_registry_packet_id').on(table.packetId),
  titleIdIdx: index('idx_packet_binary_registry_title_id').on(table.titleId),
  featureIdIdx: index('idx_packet_binary_registry_feature_id').on(table.featureId),
  sourceRefIdx: index('idx_packet_binary_registry_source_ref').on(table.sourceRef),
  communityIdIdx: index('idx_packet_binary_registry_community_id').on(table.communityId),
  somCellIdx: index('idx_packet_binary_registry_som_cell').on(table.somRow, table.somCol),
  transportTypeIdx: index('idx_packet_binary_registry_transport_type').on(table.transportType),
  payloadFormatIdx: index('idx_packet_binary_registry_payload_format').on(table.payloadFormat),
  createdAtIdx: index('idx_packet_binary_registry_created_at').on(table.createdAt),
  lastAccessedAtIdx: index('idx_packet_binary_registry_last_accessed_at').on(table.lastAccessedAt),
}));

export type PacketBinaryRegistryEntry = typeof packetBinaryRegistry.$inferSelect;
export type NewPacketBinaryRegistryEntry = typeof packetBinaryRegistry.$inferInsert;
