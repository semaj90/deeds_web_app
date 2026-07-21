// 0007_add_atlas_projection_schemas.ts - Generated for Schema Definition
// This file defines the required structure for the projection tables.
import { sql, pgTable, text, integer, timestamp, jsonb, varchar } from 'drizzle-orm/pg-core';
import { execSync } from "child_process";

export const atlasProjections = pgTable('atlas_projections', {
  id: text('id').primaryKey(), // Combination of source_ref + packet_key
  timestamp: timestamp('timestamp').default(sql`now()`).notNull(),
  data_jsonb: jsonb('data_jsonb').default(sql`{}`)
});

export const registryEnrichmentProjection = pgTable('registry_enrichment_projection', {
  source_ref: text('source_ref').notNull(),
  packet_key: text('packet_key').notNull(),
  enriched_data: jsonb('enriched_data').default(sql`{}`)
}).primaryKey('source_ref', 'packet_key');

export const registryEmbeddingIdentity = pgTable('registry_embedding_identity', {
  source_ref: text('source_ref').notNull(),
  packet_key: text('packet_key').notNull(),
  embedding_vector: text('embedding_vector').notNull(), // Stored as JSON or text for pgvector compatibility
  metadata: jsonb('metadata').default(sql`{}`)
}).primaryKey('source_ref', 'packet_key');

export const registryTopologyProjection = pgTable('registry_topology_projection', {
  source_ref: text('source_ref').notNull(),
  packet_key: text('packet_key').notNull(),
  node_attributes: jsonb('node_attributes').default(sql`{}`)
}).primaryKey('source_ref', 'packet_key');

export const registryOntologyTuples = pgTable('registry_ontology_tuples', {
  source_ref: text('source_ref').notNull(),
  packet_key: text('packet_key').notNull(),
  ontology_data: jsonb('ontology_data').default(sql`{}`)
}).primaryKey('source_ref', 'packet_key');

// NOTE: Actual migration logic for 'drizzle-kit' needs to be wrapped around these definitions.
