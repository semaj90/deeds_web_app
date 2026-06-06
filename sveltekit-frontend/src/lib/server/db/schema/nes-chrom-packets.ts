import { customType, index, integer, jsonb, pgTable, real, smallint, text, timestamp, uniqueIndex, uuid, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { kagDagRuns } from './kag-dag.js';

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
 * NES chrom packets
 *
 * Canonical compact packet store for:
 * - sourceRef-backed ACE packets
 * - chunk_id-based retrieval hits
 * - KAG DAG hit summaries
 * - pgvector-backed ANN lookup
 *
 * This is the durable "packet" layer between retrieval and Gemma summaries.
 */
export const nesChromPackets = pgTable('nes_chrom_packets', {
  id: uuid('id').primaryKey().defaultRandom(),
  packetKey: text('packet_key').notNull(),
  queryHash: text('query_hash').notNull(),
  chunkId: text('chunk_id').notNull(),
  sourceRef: text('source_ref').notNull(),
  sourceRefs: jsonb('source_refs').notNull().default(sql`'[]'::jsonb`),
  featureId: text('feature_id').notNull(),
  packetType: text('packet_type').notNull().default('nes_chrom'),
  lane: text('lane').notNull().default('semantic_packet'),
  model: text('model').notNull().default('gemma4-rotorquant:latest'),
  summary: text('summary'),
  payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
  embedding: vector('embedding', { dimensions: 768 }),
  qdrantPointId: text('qdrant_point_id'),
  kagDagRunId: uuid('kag_dag_run_id').references(() => kagDagRuns.id, { onDelete: 'set null' }),
  kagNodeKey: text('kag_node_key'),
  tokenBudget: integer('token_budget'),
  featureIds: text('feature_ids').array(),
  somCluster: text('som_cluster'),
  laneIds: text('lane_ids').array(),
  sourceRefId: integer('source_ref_id'),
  featureCode: integer('feature_code'),
  somCode: smallint('som_code'),
  confidenceScore: smallint('confidence_score'),
  packetZstd: bytea('packet_zstd'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  queryHashIdx: index('nes_chrom_packets_query_hash_idx').on(table.queryHash),
  chunkIdx: index('nes_chrom_packets_chunk_id_idx').on(table.chunkId),
  packetKeyUq: uniqueIndex('nes_chrom_packets_packet_key_key').on(table.packetKey),
  sourceRefIdx: index('nes_chrom_packets_source_ref_idx').on(table.sourceRef),
  featureIdx: index('nes_chrom_packets_feature_id_idx').on(table.featureId),
  qdrantIdx: index('nes_chrom_packets_qdrant_point_idx').on(table.qdrantPointId),
  kagRunIdx: index('nes_chrom_packets_kag_run_idx').on(table.kagDagRunId),
  sourceRefsGin: index('nes_chrom_packets_source_refs_gin').using('gin', table.sourceRefs),
  payloadGin: index('nes_chrom_packets_payload_gin').using('gin', table.payload),
  embeddingHnsw: index('nes_chrom_packets_embedding_hnsw').using('hnsw', table.embedding.op('vector_cosine_ops')),
  featureIdsGin: index('idx_nes_chrom_packets_feature_ids_gin').using('gin', table.featureIds),
  somClusterIdx: index('idx_nes_chrom_packets_som_cluster').on(table.somCluster),
  laneIdsGin: index('idx_nes_chrom_packets_lane_ids_gin').using('gin', table.laneIds),
  sourceRefIdIdx: index('nes_chrom_packets_source_ref_id_idx').on(table.sourceRefId),
  featureCodeIdx: index('nes_chrom_packets_feature_code_idx').on(table.featureCode),
  somCodeIdx: index('nes_chrom_packets_som_code_idx').on(table.somCode),
}));

/**
 * KAG DAG hits associated with a NES chrom packet.
 */
export const nesChromKagDagHits = pgTable('nes_chrom_kag_dag_hits', {
  id: uuid('id').primaryKey().defaultRandom(),
  packetId: uuid('packet_id').notNull().references(() => nesChromPackets.id, { onDelete: 'cascade' }),
  runId: uuid('run_id').references(() => kagDagRuns.id, { onDelete: 'set null' }),
  chunkId: text('chunk_id').notNull(),
  sourceRef: text('source_ref').notNull(),
  hitType: text('hit_type').notNull().default('context'),
  score: real('score'),
  nodeKey: text('node_key'),
  evidence: jsonb('evidence').notNull().default(sql`'{}'::jsonb`),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  packetIdx: index('nes_chrom_kag_dag_hits_packet_idx').on(table.packetId),
  runIdx: index('nes_chrom_kag_dag_hits_run_idx').on(table.runId),
  chunkIdx: index('nes_chrom_kag_dag_hits_chunk_idx').on(table.chunkId),
  sourceRefIdx: index('nes_chrom_kag_dag_hits_source_ref_idx').on(table.sourceRef),
  nodeKeyIdx: index('nes_chrom_kag_dag_hits_node_key_idx').on(table.nodeKey),
  evidenceGin: index('nes_chrom_kag_dag_hits_evidence_gin').using('gin', table.evidence),
  metadataGin: index('nes_chrom_kag_dag_hits_metadata_gin').using('gin', table.metadata),
}));

export type NesChromPacket = typeof nesChromPackets.$inferSelect;
export type NewNesChromPacket = typeof nesChromPackets.$inferInsert;
export type NesChromKagDagHit = typeof nesChromKagDagHits.$inferSelect;
export type NewNesChromKagDagHit = typeof nesChromKagDagHits.$inferInsert;
