import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const storageLanes   = ['postgres','redis','qdrant','neo4j','couchdb','nes','ace','atlas'] as const;
const retrievalLanes = ['ace','nes','atlas','karpathy','unknown'] as const;

export type StorageLane   = typeof storageLanes[number];
export type RetrievalLane = typeof retrievalLanes[number];

/**
 * Durable address table — closes the lineage chain across all storage layers.
 * One row per source_ref / storage_lane pair.
 *
 * Mirrors drizzle/manual/atlas_memory_address_registry.sql.
 * Seeded via: npm run atlas:memory-address:seed
 * Smoke:      npm run atlas:memory-address:smoke
 */
export const atlasMemoryAddressRegistry = pgTable('atlas_memory_address_registry', {
  memoryId:       uuid('memory_id').primaryKey().defaultRandom(),
  sourceRefId:    integer('source_ref_id'),               // FK → parent_atlas_documents.id
  sourceRef:      text('source_ref').notNull(),
  featureId:      text('feature_id'),
  packetId:       text('packet_id'),
  clusterId:      text('cluster_id'),
  embeddingId:    text('embedding_id'),
  parentMemoryId: uuid('parent_memory_id'),               // self-ref FK
  storageLane:    text('storage_lane').$type<StorageLane>().notNull(),
  retrievalLane:  text('retrieval_lane').$type<RetrievalLane>().notNull(),
  validFrom:      timestamp('valid_from',  { withTimezone: true }).defaultNow().notNull(),
  validTo:        timestamp('valid_to',    { withTimezone: true }),
  createdAt:      timestamp('created_at',  { withTimezone: true }).defaultNow().notNull(),
  updatedAt:      timestamp('updated_at',  { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  sourceRefLaneUniq: uniqueIndex('amr_source_ref_lane_uniq').on(t.sourceRef, t.storageLane),
  sourceRefIdx:      index('amr_source_ref_idx').on(t.sourceRef),
  sourceRefIdIdx:    index('amr_source_ref_id_idx').on(t.sourceRefId),
  featureIdIdx:      index('amr_feature_id_idx').on(t.featureId),
  storageLaneIdx:    index('amr_storage_lane_idx').on(t.storageLane),
  clusterIdIdx:      index('amr_cluster_id_idx').on(t.clusterId),
  validRangeIdx:     index('amr_valid_range_idx').on(t.validFrom, t.validTo),
}));

export type AtlasMemoryAddress    = typeof atlasMemoryAddressRegistry.$inferSelect;
export type NewAtlasMemoryAddress = typeof atlasMemoryAddressRegistry.$inferInsert;