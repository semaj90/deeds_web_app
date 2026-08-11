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
 *   dense_768: Primary codebase chunk / native semantic reference lane
 *   dense_384: Legacy/reference-only retrieval projection
 *   latent_64: Routing/clustering only
 *   lexical: BM25 coefficients
 *   topology: PageRank + SOM cell
 *   classifiers: hybrid semantic classification scores
 *   classifier manifests: explicit semantic slice width plus derived total width
 *
 * Usage:
 *   import { FeatureMatrixRowV1Schema, insertFeatureRow } from './feature-matrix-schema';
 *   const row = await FeatureMatrixRowV1Schema.parseAsync(rawData);
 *   await insertFeatureRow(db, row);
 */

import { z } from 'zod';
import { DIMENSIONS } from './property-dimensions';
import {
  SEMANTIC_REPRESENTATION_ID,
  SEMANTIC_DIMENSION,
} from '../embedding/embedding-contract-768.js';
import {
  EvidenceStateSchema,
  KnowledgeResolutionSchema,
  ClassificationPartOfSpeechSchema,
  VectorLaneStatusSchema,
} from './contracts/classification-contracts';

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
 * Strict identity chain for canonicalized tree-node rows.
 */
export const IdentityChainV2Schema = IdentityChainSchema.extend({
  tree_node_id: z.string().min(1).describe('AST node ID or glyph key'),
});

export type IdentityChainV2 = z.infer<typeof IdentityChainV2Schema>;

/**
 * Dense 768-dim primary semantic vector (native codebase chunk lane).
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
 * Dense 384-dim legacy/reference-only retrieval projection (truncated or projected).
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
    part_of_speech: ClassificationPartOfSpeechSchema.describe('Primary POS tag if available'),
    computed_at: z.string().datetime().optional()
  });

export type Lexical = z.infer<typeof LexicalSchema>;

/**
 * Topology representation: PageRank + SOM cell.
 */
export const TopologySchema = z
  .object({
    graph_revision: z.string().min(1).optional().nullable().describe('Graph revision used to compute the topology payload'),
    pagerank_version: z.string().min(1).optional().nullable().describe('PageRank algorithm or provenance version'),
    pagerank_raw: z.number().min(0).optional().nullable().describe('Unnormalized PageRank score before scaling'),
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
 * Classifier feature manifests keep the semantic slice width separate from the
 * total model feature width.
 *
 * The semantic segment is fixed at 768 because it is sourced from the
 * canonical semantic_768 lane. Downstream models may concatenate additional
 * lexical, AST, concept, graph, or topology features, so the total width must
 * be derived from the manifest rather than assumed to be 768.
 */
export const ClassifierSemanticSegmentSchema = z
  .object({
    representation_id: z.literal(SEMANTIC_REPRESENTATION_ID),
    offset: z.number().int().nonnegative(),
    width: z.literal(SEMANTIC_DIMENSION),
    model_id: z.string().min(1),
    model_revision: z.string().min(1),
  })
  .strict();

export const ClassifierAuxSegmentSchema = z
  .object({
    offset: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    revision: z.string().min(1),
  })
  .strict();

export const ClassifierTopologySegmentSchema = z
  .object({
    offset: z.number().int().nonnegative(),
    width: z.union([z.literal(64), z.literal(128)]),
    representation_id: z.enum(['latent_64', 'latent_128']),
    encoder_revision: z.string().min(1),
  })
  .strict();

export const ClassifierFeatureManifestSchema = z
  .object({
    schema_version: z.literal('atlas.classifier.features.v1'),
    semantic: ClassifierSemanticSegmentSchema,
    lexical: ClassifierAuxSegmentSchema,
    ast: ClassifierAuxSegmentSchema,
    concepts: ClassifierAuxSegmentSchema.optional(),
    graph: ClassifierAuxSegmentSchema.optional(),
    topology: ClassifierTopologySegmentSchema.optional(),
    total_width: z.number().int().positive(),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const segments = [
      manifest.semantic,
      manifest.lexical,
      manifest.ast,
      manifest.concepts,
      manifest.graph,
      manifest.topology,
    ].filter(Boolean) as Array<
      | z.infer<typeof ClassifierSemanticSegmentSchema>
      | z.infer<typeof ClassifierAuxSegmentSchema>
      | z.infer<typeof ClassifierTopologySegmentSchema>
    >;

    let end = 0;
    for (const [index, segment] of segments
      .slice()
      .sort((left, right) => left.offset - right.offset)
      .entries()) {
      const segmentEnd = segment.offset + segment.width;
      if (index > 0 && segment.offset < end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lexical'],
          message:
            'Classifier feature segments must not overlap and must be ordered by offset',
        });
        break;
      }

      end = Math.max(end, segmentEnd);
    }

    if (manifest.semantic.width !== 768) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['semantic', 'width'],
        message: 'Semantic segment width must be exactly 768',
      });
    }

    if (manifest.total_width !== end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['total_width'],
        message: `Classifier total width must equal the derived segment extent (${end})`,
      });
    }
  });

export type ClassifierSemanticSegment = z.infer<
  typeof ClassifierSemanticSegmentSchema
>;
export type ClassifierAuxSegment = z.infer<typeof ClassifierAuxSegmentSchema>;
export type ClassifierTopologySegment = z.infer<
  typeof ClassifierTopologySegmentSchema
>;
export type ClassifierFeatureManifest = z.infer<
  typeof ClassifierFeatureManifestSchema
>;

/**
 * Full Feature Matrix Row V1 schema.
 */
export const FeatureMatrixRowV1Schema = z.object({
  /** Metadata */
  schema_version: z.literal('1.0').default('1.0'),
  created_at: z.string().datetime().default(() => new Date().toISOString()),
  updated_at: z.string().datetime().default(() => new Date().toISOString()),
  workspace_revision: z.string().default('main').describe('git branch or deployment version'),
  lane_status: VectorLaneStatusSchema.optional().nullable(),
  evidence_state: EvidenceStateSchema.optional().nullable(),
  knowledge_resolution: KnowledgeResolutionSchema.optional().nullable(),

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
  feature_labels: z.array(z.string()).default([]).describe('Provenance-aware tags/labels for classification and clustering'),
  domain_class: z.string().min(1).nullable().optional(),
  secondary_domains: z.array(z.string().min(1)).optional().nullable(),
  ontology_ids: z.array(z.string().min(1)).default([]),
  concept_ids: z.array(z.string().min(1)).default([]),
  runtime_evidence_refs: z.array(z.string().min(1)).default([]),
  test_evidence_refs: z.array(z.string().min(1)).default([]),
});

export type FeatureMatrixRowV1 = z.infer<typeof FeatureMatrixRowV1Schema>;

/**
 * FeatureMatrixRowV2 — strict identity bridge with required tree_node_id.
 */
export const FeatureMatrixRowV2Schema = FeatureMatrixRowV1Schema.extend({
  schema_version: z.literal('2.0').default('2.0'),
  identity: IdentityChainV2Schema,
});

export type FeatureMatrixRowV2 = z.infer<typeof FeatureMatrixRowV2Schema>;

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
      return { ok: false, errors: e.issues.map(err => `${err.path.join('.')}: ${err.message}`) };
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
  lane_status?: z.infer<typeof VectorLaneStatusSchema> | null;
  evidence_state?: z.infer<typeof EvidenceStateSchema> | null;
  knowledge_resolution?: z.infer<typeof KnowledgeResolutionSchema> | null;
  domain_class?: string | null;
  ontology_ids?: string[];
  concept_ids?: string[];
  runtime_evidence_refs?: string[];
  test_evidence_refs?: string[];
  secondary_domains?: string[];
  workspace_revision?: string;
}): FeatureMatrixRowV1 {
  return {
    schema_version: '1.0',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    workspace_revision: input.workspace_revision ?? 'main',
    lane_status: input.lane_status ?? null,
    evidence_state: input.evidence_state ?? null,
    knowledge_resolution: input.knowledge_resolution ?? null,
    identity: input.identity,
    dense_768: input.dense_768 ?? null,
    dense_384: input.dense_384 ?? null,
    latent_64: input.latent_64 ?? null,
    lexical: input.lexical ?? null,
    topology: input.topology ?? null,
    classifiers: input.classifiers ?? null,
    is_valid: true,
    validation_errors: [],
    feature_labels: input.feature_labels ?? [],
    domain_class: input.domain_class ?? null,
    secondary_domains: input.secondary_domains ?? [],
    ontology_ids: input.ontology_ids ?? [],
    concept_ids: input.concept_ids ?? [],
    runtime_evidence_refs: input.runtime_evidence_refs ?? [],
    test_evidence_refs: input.test_evidence_refs ?? [],
  };
}

/**
 * Create a feature row for the authoritative bridge.
 */
export function createFeatureRowV2(input: {
  identity: IdentityChainV2;
  dense_768?: Dense768;
  dense_384?: Dense384;
  latent_64?: Latent64;
  lexical?: Lexical;
  topology?: Topology;
  classifiers?: Classifiers;
  feature_labels?: string[];
  lane_status?: z.infer<typeof VectorLaneStatusSchema> | null;
  evidence_state?: z.infer<typeof EvidenceStateSchema> | null;
  knowledge_resolution?: z.infer<typeof KnowledgeResolutionSchema> | null;
  domain_class?: string | null;
  ontology_ids?: string[];
  concept_ids?: string[];
  runtime_evidence_refs?: string[];
  test_evidence_refs?: string[];
  secondary_domains?: string[];
  workspace_revision?: string;
}): FeatureMatrixRowV2 {
  return FeatureMatrixRowV2Schema.parse({
    ...createFeatureRow(input),
    schema_version: '2.0',
    identity: input.identity,
  });
}
