import { pgTable, text, timestamp, unique, jsonb, doublePrecision, uuid, integer, real } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Durable 1-to-many enhanced graph mapping table.
 * Source of truth for GraphRAG synthesis and ACE context packing.
 */
export const enhancedGraphMappings = pgTable(
  'enhanced_graph_mappings',
  {
    id: text('id').primaryKey(), // e.g. 'file:src/app.ts', 'svg:ace-pipeline'
    kind: text('kind').notNull(), // 'file', 'symbol', 'route', 'schema', 'svg', 'proto', 'redis_key', 'qdrant_collection', 'grpc_method', 'chunk', 'cluster'
    label: text('label').notNull(),
    path: text('path'),
    summary: text('summary'),

    /**
     * One-to-many edges stored as JSONB.
     * Array<{ relation: string, targets: string[], confidence: number, source: string }>
     */
    edges: jsonb('edges').$type<Array<{
      relation: string;
      targets: string[];
      confidence: number;
      source: string;
    }>>().default([]).notNull(),

    /**
     * Computed authority and attention scores.
     */
    scores: jsonb('scores').$type<{
      pagerank?: number;
      authority?: number;
      karpathyBlend?: number;
      autoencoderScore?: number;
      attentionScore?: number;
      grpoReward?: number;
    }>().default({}).notNull(),

    /**
     * Bitflags for fast CPU filtering (NodeFlags).
     */
    flags: integer('flags').default(0).notNull(),

    /**
     * Embeddings and autoencoder vectors.
     */
    vectors: jsonb('vectors').$type<{
      embedding768?: number[];
      encoded64?: number[];
    }>().default({}).notNull(),

    /**
     * Extracted 4D topological grounding.
     */
    manifold4: real('manifold4').array(),

    metadata: jsonb('metadata').default({}).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  }
);
