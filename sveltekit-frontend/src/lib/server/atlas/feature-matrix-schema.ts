/**
 * feature-matrix-schema.ts
 *
 * Canonical Feature Matrix Row schema (FeatureMatrixRowV1).
 * Versioned for forward compatibility; persists to Postgres atlas_feature_matrix_rows.
 *
 * Identity lineage (immutable):
 *   packet_key → source_ref → file_path → function_symbol → feature_id → title_id → tree_node_id
 *
 * Feature representations (separate, versioned):
 *   dense_768: Native embeddinggemma canonical
 *   dense_384: Online retrieval projection
 *   latent_64: Routing/clustering only
 *   lexical: BM25 coefficients
 *   topology: PageRank + SOM cell
 *   classifiers: hybrid semantic classification scores
 *
 * Usage:
 *   import { FeatureMatrixRowV1Schema, insertFeatureRow } from './feature-matrix-schema';
 *   const row = await FeatureMatrixRowV1Schema.parseAsync(rawData);
 *   await insertFeatureRow(db, row);
 */

import { z } from 'zod';
import { DIMENSIONS } from './property-dimensions';

/**
 * Immutable identity chain.
 */
export const IdentityChainSchema = z.object({
  packet_key: z.string().min(1).describe('ace:packet:* or similar'),
  source_ref: z.string().min(1).describe('file path + line:col'),
  file_path: z.string().min(1),
  function_symbol: z.string().optional().nullable().describe('e.g. "validateSession"'),
  feature_id: z.string().min(1).describe('domain.subsystem'),
  title_id: z.string().optional().nullable(),
  tree_node_id: z.string().optional().nullable().describe('AST node ID or glyph key')
});

export type IdentityChain = z.infer<typeof IdentityChainSchema>;

/**
 * Dense 768-dim canonical vector (native embeddinggemma).
 */
export const Dense768Schema = z
  .object({
    model: z.literal('embeddinggemma:latest').default('embeddinggemma:latest'),
    version: z.string().default('1.0'),
    embedding: z.instanceof(Float32Array).or(z.array(z.number()).min(768).max(768)),
    computed_at: z.string().datetime(),
    content_hash: z.string().describe('SHA-256 of input text for lineage')
  });

export type Dense768 = z.infer<typeof Dense768Schema>;

/**
 * Dense 384-dim retrieval projection (truncated or projected).
 */
export const Dense384Schema = z
  .object({
    model: z.literal('embeddinggemma:latest:truncated').default('embeddinggemma:latest:truncated'),
    projection_type: z.enum(['truncate_768', 'pca_768_to_384', 'learned_projection']).default('truncate_768'),
    version: z.string().default('1.0'),
    embedding: z.instanceof(Float32Array).or(z.array(z.number()).min(384).max(384)).optional().nullable(),
    computed_at: z.string().datetime().optional(),
    content_hash: z.string().optional().nullable()
  });

export type Dense384 = z.infer<typeof Dense384Schema>;

/**
 * Latent 64-dim routing features (autoencoder output or AE feats).
 * For K-means/SOM routing only, NOT for search.
 */
export const Latent64Schema = z
  .object({
    model: z.literal('autoencoder_768_to_64').default('autoencoder_768_to_64'),
    version: z.string().default('1.0'),
    embedding: z.instanceof(Float32Array).or(z.array(z.number()).min(64).max(64)).optional().nullable(),
    computed_at: z.string().datetime().optional(),
    /** Note: AE is not meant for direct similarity; this is routing/clustering only */
    routing_use_only: z.boolean().default(true)
  });

export type Latent64 = z.infer<typeof Latent64Schema>;

/**
 * Lexical/BM25 representation.
 */
export const LexicalSchema = z
  .object({
    method: z.enum(['bm25', 'bm42', 'tf_idf']).default('bm25'),
    term_count: z.number().int().min(0),
    top_terms: z.array(z.tuple([z.string(), z.number()])).max(20).describe('[term, score] pairs'),
    computed_at: z.string().datetime().optional()
  });

export type Lexical = z.infer<typeof LexicalSchema>;

/**
 * Topology representation: PageRank + SOM cell.
 */
export const TopologySchema = z
  .object({
    pagerank_score: z.number().min(0).max(1).optional().nullable().describe('Node authority (0-1 normalized)'),
    som_cell_row: z.number().int().min(0).max(19).optional().nullable().describe('SOM grid row (0-19 for 20x20)'),
    som_cell_col: z.number().int().min(0).max(19).optional().nullable().describe('SOM grid col (0-19 for 20x20)'),
    som_index: z.number().int().optional().nullable().describe('Flattened SOM index (row*20 + col)'),
    som_distance_to_centroid: z.number().min(0).optional().nullable(),
    hilbert_order: z.string().optional().nullable().describe('Hilbert curve ordering (advisory only)'),
    neighbors_k_hop: z.array(z.string()).max(10).optional().describe('Top K neighbor packet_keys'),
    computed_at: z.string().datetime().optional()
  });

export type Topology = z.infer<typeof TopologySchema>;

/**
 * Classifier scores: provenance-aware hybrid semantic classification.
 */
export const ClassifiersSchema = z
  .object({
    naive_bayes_class: z.string().optional().nullable().describe('Predicted class'),
    naive_bayes_score: z.number().min(0).max(1).optional().nullable(),
    logistic_regression_score: z.number().min(0).max(1).optional().nullable(),
    xgboost_score: z.number().min(0).max(1).optional().nullable(),
    computed_at: z.string().datetime().optional()
  });

export type Classifiers = z.infer<typeof ClassifiersSchema>;

/**
 * Full Feature Matrix Row V1 schema.
 */
export const FeatureMatrixRowV1Schema = z.object({
  /** Metadata */
  schema_version: z.literal('1.0').default('1.0'),
  created_at: z.string().datetime().default(() => new Date().toISOString()),
  updated_at: z.string().datetime().default(() => new Date().toISOString()),
  workspace_revision: z.string().default('main').describe('git branch or deployment version'),

  /** Immutable identity chain */
  identity: IdentityChainSchema,

  /** Vector representations (independent, versioned) */
  dense_768: Dense768Schema.optional().nullable(),
  dense_384: Dense384Schema.optional().nullable(),
  latent_64: Latent64Schema.optional().nullable(),

  /** Auxiliary representations */
  lexical: LexicalSchema.optional().nullable(),
  topology: TopologySchema.optional().nullable(),
  classifiers: ClassifiersSchema.optional().nullable(),

  /** Metadata flags */
  is_valid: z.boolean().default(true),
  validation_errors: z.array(z.string()).default([]),
  feature_labels: z.array(z.string()).default([]).describe('Provenance-aware tags/labels for classification and clustering')
});

export type FeatureMatrixRowV1 = z.infer<typeof FeatureMatrixRowV1Schema>;

/**
 * Safe parsing with detailed error reporting.
 */
export async function parseFeatureRow(
  data: unknown
): Promise<{ ok: true; row: FeatureMatrixRowV1 } | { ok: false; errors: string[] }> {
  try {
    const row = await FeatureMatrixRowV1Schema.parseAsync(data);
    return { ok: true, row };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, errors: e.errors.map(err => `${err.path.join('.')}: ${err.message}`) };
    }
    return { ok: false, errors: ['Unknown parsing error'] };
  }
}

/**
 * Create a feature row with identity chain + optional vectors.
 * (No DB write; just construction + validation.)
 */
export function createFeatureRow(input: {
  identity: IdentityChain;
  dense_768?: Dense768;
  dense_384?: Dense384;
  latent_64?: Latent64;
  lexical?: Lexical;
  topology?: Topology;
  classifiers?: Classifiers;
  feature_labels?: string[];
  workspace_revision?: string;
}): FeatureMatrixRowV1 {
  return {
    schema_version: '1.0',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    workspace_revision: input.workspace_revision ?? 'main',
    identity: input.identity,
    dense_768: input.dense_768 ?? null,
    dense_384: input.dense_384 ?? null,
    latent_64: input.latent_64 ?? null,
    lexical: input.lexical ?? null,
    topology: input.topology ?? null,
    classifiers: input.classifiers ?? null,
    is_valid: true,
    validation_errors: [],
    feature_labels: input.feature_labels ?? []
  };
}
