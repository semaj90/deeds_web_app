import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  uuid,
  real,
  serial,
  smallint,
  index,
  uniqueIndex,
  customType,
  vector,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { kagDagRuns } from './kag-dag.js';

// Inline boolean avoids ESM live-binding race under --experimental-loader
// when this module is evaluated before drizzle-orm/pg-core finishes init.
const pgBoolean = customType<{ data: boolean; driverData: boolean }>({
  dataType() { return 'boolean'; },
  fromDriver(value) { return Boolean(value); },
  toDriver(value) { return value; },
});

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
  featureLabel: text('feature_label'),
  packetType: text('packet_type').notNull().default('nes_chrom'),
  lane: text('lane').notNull().default('semantic_packet'),
  model: text('model').notNull().default('gemma4-rotorquant:latest'),
  summary: text('summary'),
  filePath: text('file_path'),
  communityId: integer('community_id'),
  communityConfidence: real('community_confidence'),
  communitySource: text('community_source'),
  domainClass: text('domain_class'),
  ledgerType: text('ledger_type'),
  lineageVersion: text('lineage_version'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  tags: jsonb('tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  canonical: pgBoolean('canonical').notNull().default(false),
  identityLane: text('identity_lane').default('qdrant_chunk'),
  payloadBackfilledAt: timestamp('payload_backfilled_at', { withTimezone: true }),
  somRow: integer('som_row'),
  somCol: integer('som_col'),
  somIndex: integer('som_index'),
  kmeansCluster: integer('kmeans_cluster'),
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
  sourceRefAliasIdx: index('idx_nes_chrom_packets_source_ref').on(table.sourceRef),
  sourceRefMirrorIdx: index('idx_nes_chrom_packets_source_ref_idx').on(table.sourceRef),
  featureIdx: index('nes_chrom_packets_feature_id_idx').on(table.featureId),
  featureAliasIdx: index('idx_nes_chrom_packets_feature_id').on(table.featureId),
  featureMirrorIdx: index('idx_nes_chrom_packets_feature_id_idx').on(table.featureId),
  featureSourceIdx: index('idx_nes_chrom_packets_feature_source').on(table.featureId, table.sourceRef),
  featureLabelIdx: index('idx_nes_chrom_packets_feature_label_idx').on(table.featureLabel),
  communityIdIdx: index('idx_nes_chrom_packets_community_id_idx').on(table.communityId),
  communityConfidenceIdx: index('idx_nes_chrom_packets_community_confidence_idx').on(table.communityConfidence),
  communitySourceIdx: index('idx_nes_chrom_packets_community_source_idx').on(table.communitySource),
  domainClassIdx: index('idx_nes_chrom_packets_domain_class_idx').on(table.domainClass),
  ledgerTypeIdx: index('idx_nes_chrom_packets_ledger_type_idx').on(table.ledgerType),
  lineageVersionIdx: index('idx_nes_chrom_packets_lineage_version_idx').on(table.lineageVersion),
  metadataGin: index('idx_nes_chrom_packets_metadata_gin').using('gin', table.metadata),
  tagsGin: index('idx_nes_chrom_packets_tags_gin').using('gin', table.tags),
  somIndexIdx: index('idx_nes_chrom_packets_som_index_idx').on(table.somIndex),
  kmeansClusterIdx: index('idx_nes_chrom_packets_kmeans_cluster_idx').on(table.kmeansCluster),
  packetKeyAliasIdx: index('idx_nes_chrom_packets_packet_key_idx').on(table.packetKey),
  qdrantIdx: index('nes_chrom_packets_qdrant_point_idx').on(table.qdrantPointId),
  kagRunIdx: index('nes_chrom_packets_kag_run_idx').on(table.kagDagRunId),
  sourceRefsGin: index('nes_chrom_packets_source_refs_gin').using('gin', table.sourceRefs),
  payloadGin: index('nes_chrom_packets_payload_gin').using('gin', table.payload),
  embeddingHnsw: index('nes_chrom_packets_embedding_hnsw').using('hnsw', table.embedding.op('vector_cosine_ops')),
  sourceRefTrgmIdx: index('nes_chrom_packets_source_ref_trgm_idx').using('gin', sql`${table.sourceRef} gin_trgm_ops`),
  normSourceRefTrgmIdx: index('nes_chrom_packets_norm_source_ref_trgm_idx').using('gin', sql`lower(${table.sourceRef}) gin_trgm_ops`),
  summaryTrgmIdx: index('nes_chrom_packets_summary_trgm_idx').using('gin', sql`${table.summary} gin_trgm_ops`),
  featureIdsGin: index('idx_nes_chrom_packets_feature_ids_gin').using('gin', table.featureIds),
  somClusterIdx: index('idx_nes_chrom_packets_som_cluster').on(table.somCluster),
  laneIdsGin: index('idx_nes_chrom_packets_lane_ids_gin').using('gin', table.laneIds),
  sourceRefIdIdx: index('nes_chrom_packets_source_ref_id_idx').on(table.sourceRefId),
  featureCodeIdx: index('nes_chrom_packets_feature_code_idx').on(table.featureCode),
  somCodeIdx: index('nes_chrom_packets_som_code_idx').on(table.somCode),
  confidenceScoreIdx: index('nes_chrom_packets_confidence_score_idx').on(table.confidenceScore),
  packetZstdIdx: index('nes_chrom_packets_packet_zstd_idx').on(table.packetZstd),
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

export const packetMarkdownChunks = pgTable('packet_markdown_chunks', {
  id: serial('id').primaryKey(),
  packetKey: text('packet_key').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  markdownContent: text('markdown_content').notNull(),
  tsVector: customType<{ data: string }>({
    dataType() {
      return 'tsvector';
    },
  })('ts_vector'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  packetKeyIdx: index('packet_markdown_chunks_packet_key_idx').on(table.packetKey),
  keyChunkIdx: uniqueIndex('packet_markdown_chunks_key_chunk_idx').on(table.packetKey, table.chunkIndex),
  tsVectorIdx: index('packet_markdown_chunks_ts_vector_idx').using('gin', table.tsVector),
  markdownContentTrgmIdx: index('packet_markdown_chunks_markdown_content_trgm_idx').using('gin', table.markdownContent),
}));

export type PacketMarkdownChunk = typeof packetMarkdownChunks.$inferSelect;
export type NewPacketMarkdownChunk = typeof packetMarkdownChunks.$inferInsert;
