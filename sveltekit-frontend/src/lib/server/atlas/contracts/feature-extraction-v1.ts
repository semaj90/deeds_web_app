import { z } from 'zod';
import { validateFeatureVector5, type FeatureVector5 } from '../tensors/feature-matrix-contract.js';
import { DomainClassificationV1Schema } from './semantic-signal-v1.js';
import {
  ATLAS_CANONICAL_SEMANTIC_REPRESENTATION as SEMANTIC_REPRESENTATION_ID,
  ATLAS_CANONICAL_SEMANTIC_DIMENSION as SEMANTIC_DIMENSION,
} from '../retrieval/qdrant-semantic-projection.js';

export { DomainClassificationV1Schema } from './semantic-signal-v1.js';

export const FEATURE_EXTRACTION_SCHEMA_VERSION = 'atlas.feature-extraction.v1' as const;

// Canonical semantic identity — re-exported (not redeclared) from
// qdrant-semantic-projection.ts, the real owner for Atlas's own persisted
// representation (already wired into the live semantic-lineage.ts /
// semantic-packet-writer.ts production writer chain, which writes to
// Postgres atlas_packets — per the 2026-08-19 operator correction recorded
// in openspec/changes/parent-atlas-semantic-512-canonicalization/tasks.md,
// superseding the reference below). This file previously redeclared its own
// copy of these constants, which was itself a duplicate-canonical-owner
// mistake — fixed same session it was introduced. Every other Atlas-scoped
// contract in this repo (e.g. gpu-quantization-v1.ts) must import from here
// or from qdrant-semantic-projection.ts, never redeclare. embedding-contract-768.ts
// remains canonical for the separate, general (non-Atlas) codebase_chunks_768
// corpus — do not conflate the two representations.
export const CANONICAL_SEMANTIC_REPRESENTATION_ID = SEMANTIC_REPRESENTATION_ID;
export const CANONICAL_SEMANTIC_DIMENSION = SEMANTIC_DIMENSION;

export const STATIC_PACKET_FEATURE_NAMES = [
  'authority_norm',
  'domain_fit_base',
  'ast_signal',
  'entropy_norm',
  'execution_utility',
] as const;

export const CANDIDATE_FEATURE_NAMES = [
  'semantic_similarity_768',
  'lexical_score',
  'exact_symbol_match',
  'ast_signal',
  'authority_norm',
  'community_fit',
  'domain_fit_query',
  'concept_fit',
  'nary_relation_fit',
  'kmeans_centroid_similarity',
  'kmeans_cluster_rank',
  'som_distance',
  'som_neighbor_radius',
  'hilbert_locality',
  'summary_quality',
  'summary_provenance',
  'recency',
  'retrieval_frequency',
  'execution_utility',
  'graph_distance',
  'process_fit',
  'dependency_fanout',
  'feature_label_confidence',
  'source_revision_match',
  'representation_revision_match',
] as const;

export const JsonlParsedEvidenceV1Schema = z
  .object({
    schema_version: z.literal(FEATURE_EXTRACTION_SCHEMA_VERSION),
    kind: z.literal('jsonl_parsed_evidence'),
    packet_key: z.string().min(1),
    source_ref: z.string().min(1),
    source_revision: z.string().min(1),
    workspace_revision: z.string().min(1),
    parser_revision: z.string().min(1),
    record_index: z.number().int().nonnegative(),
    line_number: z.number().int().nonnegative(),
    raw_json: z.unknown(),
    content_hash: z.string().min(1),
    created_at: z.string().datetime(),
  })
  .strict();

export const PosCandidateLabelSchema = z
  .object({
    label: z.string().min(1),
    score: z.number().min(0).max(1),
  })
  .strict();

export const PosTaggerOutputV1Schema = z
  .object({
    schema_version: z.literal(FEATURE_EXTRACTION_SCHEMA_VERSION),
    kind: z.literal('pos_tagger_output'),
    packet_key: z.string().min(1),
    source_ref: z.string().min(1),
    source_revision: z.string().min(1),
    tree_node_id: z.string().min(1).nullable().optional(),
    title_id: z.string().min(1).nullable().optional(),
    representation_id: z.literal(CANONICAL_SEMANTIC_REPRESENTATION_ID),
    representation_revision: z.string().min(1),
    producer_id: z.string().min(1),
    producer_revision: z.string().min(1),
    model_revision: z.string().min(1).nullable().optional(),
    head_type: z.literal('pytorch'),
    token_index: z.number().int().nonnegative(),
    surface: z.string().min(1),
    part_of_speech: z.string().min(1),
    confidence: z.number().min(0).max(1),
    top_k_labels: z.array(PosCandidateLabelSchema).min(1).max(8),
    evidence_refs: z.array(z.string().min(1)).max(16).default([]),
    created_at: z.string().datetime(),
  })
  .strict();

export const FeatureVector5StaticSchema = z
  .object({
    schema_version: z.literal(FEATURE_EXTRACTION_SCHEMA_VERSION),
    kind: z.literal('feature_matrix_5'),
    packet_key: z.string().min(1),
    source_ref: z.string().min(1),
    source_revision: z.string().min(1).nullable().optional(),
    workspace_revision: z.string().min(1),
    representation_revision: z.string().min(1),
    feature_revision: z.string().min(1),
    features: z.tuple([
      z.number().nullable(),
      z.number().nullable(),
      z.number().nullable(),
      z.number().nullable(),
      z.number().nullable(),
    ]),
    presence_mask: z.tuple([
      z.number().int().min(0).max(1),
      z.number().int().min(0).max(1),
      z.number().int().min(0).max(1),
      z.number().int().min(0).max(1),
      z.number().int().min(0).max(1),
    ]),
    source_values: z
      .object({
        authority_norm: z.number().min(0).max(1).nullable().optional(),
        domain_fit_base: z.number().min(0).max(1).nullable().optional(),
        ast_signal: z.number().min(0).max(1).nullable().optional(),
        entropy_norm: z.number().min(0).max(1).nullable().optional(),
        execution_utility: z.number().min(0).max(1).nullable().optional(),
      })
      .strict(),
    created_at: z.string().datetime(),
  })
  .strict();

export const CandidateFeatureMatrixRowV1Schema = z
  .object({
    schema_version: z.literal(FEATURE_EXTRACTION_SCHEMA_VERSION),
    kind: z.literal('candidate_feature_matrix_row'),
    query_packet_key: z.string().min(1),
    candidate_packet_key: z.string().min(1),
    source_ref: z.string().min(1),
    source_revision: z.string().min(1),
    workspace_revision: z.string().min(1),
    representation_id: z.literal(CANONICAL_SEMANTIC_REPRESENTATION_ID),
    representation_revision: z.string().min(1),
    feature_revision: z.string().min(1),
    semantic_similarity_768: z.number().min(0).max(1),
    lexical_score: z.number().min(0).max(1),
    exact_symbol_match: z.number().min(0).max(1),
    ast_signal: z.number().min(0).max(1),
    authority_norm: z.number().min(0).max(1),
    community_fit: z.number().min(0).max(1),
    domain_fit_query: z.number().min(0).max(1),
    concept_fit: z.number().min(0).max(1),
    nary_relation_fit: z.number().min(0).max(1),
    kmeans_centroid_similarity: z.number().min(0).max(1),
    kmeans_cluster_rank: z.number().int().nonnegative(),
    som_distance: z.number().min(0),
    som_neighbor_radius: z.number().int().nonnegative().max(2),
    hilbert_locality: z.number().min(0).max(1),
    summary_quality: z.number().min(0).max(1),
    summary_provenance: z.number().min(0).max(1),
    recency: z.number().min(0).max(1),
    retrieval_frequency: z.number().min(0).max(1),
    execution_utility: z.number().min(0).max(1),
    graph_distance: z.number().min(0).max(1),
    process_fit: z.number().min(0).max(1),
    dependency_fanout: z.number().min(0).max(1),
    feature_label_confidence: z.number().min(0).max(1),
    source_revision_match: z.number().min(0).max(1),
    representation_revision_match: z.number().min(0).max(1),
    created_at: z.string().datetime(),
  })
  .strict();

export const SemanticTensorV1Schema = z
  .object({
    schema_version: z.literal(FEATURE_EXTRACTION_SCHEMA_VERSION),
    kind: z.literal('semantic_tensor'),
    packet_key: z.string().min(1),
    source_ref: z.string().min(1),
    source_revision: z.string().min(1),
    workspace_revision: z.string().min(1),
    representation_id: z.literal(CANONICAL_SEMANTIC_REPRESENTATION_ID),
    representation_revision: z.string().min(1),
    dimension: z.literal(CANONICAL_SEMANTIC_DIMENSION),
    vector: z
      .instanceof(Float32Array)
      .or(
        z
          .array(z.number())
          .min(CANONICAL_SEMANTIC_DIMENSION)
          .max(CANONICAL_SEMANTIC_DIMENSION),
      ),
    feature_revision: z.string().min(1),
    producer_id: z.string().min(1),
    producer_revision: z.string().min(1),
    created_at: z.string().datetime(),
  })
  .strict();

export const FeatureMatrixSetupV1Schema = z
  .object({
    schema_version: z.literal(FEATURE_EXTRACTION_SCHEMA_VERSION),
    kind: z.literal('feature_matrix_setup'),
    packet_key: z.string().min(1),
    source_ref: z.string().min(1),
    source_revision: z.string().min(1),
    workspace_revision: z.string().min(1),
    tree_node_id: z.string().min(1).nullable().optional(),
    title_id: z.string().min(1).nullable().optional(),
    representation_id: z.literal(CANONICAL_SEMANTIC_REPRESENTATION_ID),
    representation_revision: z.string().min(1),
    semantic_dimension: z.literal(CANONICAL_SEMANTIC_DIMENSION),
    feature_revision: z.string().min(1),
    producer_id: z.string().min(1),
    producer_revision: z.string().min(1),
    parser_revision: z.string().min(1),
    extractor_revision: z.string().min(1),
    pos_tagger_revision: z.string().min(1).nullable().optional(),
    domain_classifier_revision: z.string().min(1).nullable().optional(),
    graph_revision: z.string().min(1).nullable().optional(),
    jsonl_source_digest: z.string().min(1),
    feature_tiers: z
      .object({
        static_packet: z
          .object({
            enabled: z.literal(true),
            tensor_name: z.literal('feature_matrix_5'),
            representation_id: z.literal('feature_matrix_5'),
            width: z.literal(5),
            column_names: z.tuple([
              z.literal('authority_norm'),
              z.literal('domain_fit_base'),
              z.literal('ast_signal'),
              z.literal('entropy_norm'),
              z.literal('execution_utility'),
            ]),
            storage_format: z.literal('feature_matrix_5.arrow'),
            presence_mask_required: z.literal(true),
            source_provenance: z
              .object({
                workspace_revision: z.string().min(1),
                source_revision: z.string().min(1).nullable().optional(),
                feature_revision: z.string().min(1),
              })
              .strict(),
          })
          .strict(),
        candidate_query: z
          .object({
            enabled: z.literal(true),
            tensor_name: z.literal('candidate_feature_matrix'),
            width: z.literal(25),
            column_names: z.tuple([
              z.literal('semantic_similarity_768'),
              z.literal('lexical_score'),
              z.literal('exact_symbol_match'),
              z.literal('ast_signal'),
              z.literal('authority_norm'),
              z.literal('community_fit'),
              z.literal('domain_fit_query'),
              z.literal('concept_fit'),
              z.literal('nary_relation_fit'),
              z.literal('kmeans_centroid_similarity'),
              z.literal('kmeans_cluster_rank'),
              z.literal('som_distance'),
              z.literal('som_neighbor_radius'),
              z.literal('hilbert_locality'),
              z.literal('summary_quality'),
              z.literal('summary_provenance'),
              z.literal('recency'),
              z.literal('retrieval_frequency'),
              z.literal('execution_utility'),
              z.literal('graph_distance'),
              z.literal('process_fit'),
              z.literal('dependency_fanout'),
              z.literal('feature_label_confidence'),
              z.literal('source_revision_match'),
              z.literal('representation_revision_match'),
            ]),
            ranking_role: z.literal('query_time_rerank'),
            top_cluster_soft_cap: z.number().int().positive().max(64).default(8),
            kmeans_candidates: z.tuple([z.literal(64), z.literal(128), z.literal(256)]),
            som_grid: z.tuple([z.literal(20), z.literal(20)]),
            hilbert_soft_cap: z.number().int().positive().max(64).default(8),
            exact_knn_top_k: z.number().int().positive().max(1000).default(100),
            rerank_top_k: z.number().int().positive().max(256).default(64),
          })
          .strict(),
        semantic: z
          .object({
            enabled: z.literal(true),
            tensor_name: z.literal(CANONICAL_SEMANTIC_REPRESENTATION_ID),
            representation_id: z.literal(CANONICAL_SEMANTIC_REPRESENTATION_ID),
            width: z.literal(CANONICAL_SEMANTIC_DIMENSION),
            source_role: z.literal('canonical_semantic_geometry'),
            storage_format: z.literal(`${CANONICAL_SEMANTIC_REPRESENTATION_ID}.arrow`),
          })
          .strict(),
      })
      .strict(),
    derived_heads: z
      .object({
        pos: z
          .object({
            enabled: z.literal(true),
            head_type: z.literal('pytorch'),
            max_labels: z.literal(8),
          })
          .strict(),
        domain: z
          .object({
            enabled: z.literal(true),
            head_type: z.literal('pytorch'),
            max_labels: z.literal(8),
          })
          .strict(),
      })
      .strict(),
    domain_classification: DomainClassificationV1Schema.nullable().optional(),
    created_at: z.string().datetime(),
  })
  .strict();

export type JsonlParsedEvidenceV1 = z.infer<typeof JsonlParsedEvidenceV1Schema>;
export type PosCandidateLabel = z.infer<typeof PosCandidateLabelSchema>;
export type PosTaggerOutputV1 = z.infer<typeof PosTaggerOutputV1Schema>;
export type FeatureVector5Static = z.infer<typeof FeatureVector5StaticSchema>;
export type CandidateFeatureMatrixRowV1 = z.infer<typeof CandidateFeatureMatrixRowV1Schema>;
export type SemanticTensorV1 = z.infer<typeof SemanticTensorV1Schema>;
export type FeatureMatrixSetupV1 = z.infer<typeof FeatureMatrixSetupV1Schema>;

export function buildFeatureVector5StaticRow(input: {
  packetKey: string;
  sourceRef: string;
  sourceRevision?: string | null;
  workspaceRevision: string;
  representationRevision: string;
  featureRevision: string;
  authorityNorm?: number | null;
  domainFitBase?: number | null;
  astSignal?: number | null;
  entropyNorm?: number | null;
  executionUtility?: number | null;
  createdAt?: string;
}): FeatureVector5Static {
  const row: FeatureVector5 = [
    input.authorityNorm ?? 0,
    input.domainFitBase ?? 0,
    input.astSignal ?? 0,
    input.entropyNorm ?? 0,
    input.executionUtility ?? 0,
  ];

  validateFeatureVector5(row);

  return FeatureVector5StaticSchema.parse({
    schema_version: FEATURE_EXTRACTION_SCHEMA_VERSION,
    kind: 'feature_matrix_5',
    packet_key: input.packetKey,
    source_ref: input.sourceRef,
    source_revision: input.sourceRevision ?? null,
    workspace_revision: input.workspaceRevision,
    representation_revision: input.representationRevision,
    feature_revision: input.featureRevision,
    features: row,
    presence_mask: [
      input.authorityNorm == null ? 0 : 1,
      input.domainFitBase == null ? 0 : 1,
      input.astSignal == null ? 0 : 1,
      input.entropyNorm == null ? 0 : 1,
      input.executionUtility == null ? 0 : 1,
    ],
    source_values: {
      authority_norm: input.authorityNorm ?? null,
      domain_fit_base: input.domainFitBase ?? null,
      ast_signal: input.astSignal ?? null,
      entropy_norm: input.entropyNorm ?? null,
      execution_utility: input.executionUtility ?? null,
    },
    created_at: input.createdAt ?? new Date().toISOString(),
  });
}

export function buildCandidateFeatureMatrixRow(input: {
  queryPacketKey: string;
  candidatePacketKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  representationRevision: string;
  featureRevision: string;
  semanticSimilarity768: number;
  lexicalScore: number;
  exactSymbolMatch: number;
  astSignal: number;
  authorityNorm: number;
  communityFit: number;
  domainFitQuery: number;
  conceptFit: number;
  naryRelationFit: number;
  kmeansCentroidSimilarity: number;
  kmeansClusterRank: number;
  somDistance: number;
  somNeighborRadius: number;
  hilbertLocality: number;
  summaryQuality: number;
  summaryProvenance: number;
  recency: number;
  retrievalFrequency: number;
  executionUtility: number;
  graphDistance: number;
  processFit: number;
  dependencyFanout: number;
  featureLabelConfidence: number;
  sourceRevisionMatch: number;
  representationRevisionMatch: number;
  createdAt?: string;
}): CandidateFeatureMatrixRowV1 {
  return CandidateFeatureMatrixRowV1Schema.parse({
    schema_version: FEATURE_EXTRACTION_SCHEMA_VERSION,
    kind: 'candidate_feature_matrix_row',
    query_packet_key: input.queryPacketKey,
    candidate_packet_key: input.candidatePacketKey,
    source_ref: input.sourceRef,
    source_revision: input.sourceRevision,
    workspace_revision: input.workspaceRevision,
    representation_id: CANONICAL_SEMANTIC_REPRESENTATION_ID,
    representation_revision: input.representationRevision,
    feature_revision: input.featureRevision,
    semantic_similarity_768: input.semanticSimilarity768,
    lexical_score: input.lexicalScore,
    exact_symbol_match: input.exactSymbolMatch,
    ast_signal: input.astSignal,
    authority_norm: input.authorityNorm,
    community_fit: input.communityFit,
    domain_fit_query: input.domainFitQuery,
    concept_fit: input.conceptFit,
    nary_relation_fit: input.naryRelationFit,
    kmeans_centroid_similarity: input.kmeansCentroidSimilarity,
    kmeans_cluster_rank: input.kmeansClusterRank,
    som_distance: input.somDistance,
    som_neighbor_radius: input.somNeighborRadius,
    hilbert_locality: input.hilbertLocality,
    summary_quality: input.summaryQuality,
    summary_provenance: input.summaryProvenance,
    recency: input.recency,
    retrieval_frequency: input.retrievalFrequency,
    execution_utility: input.executionUtility,
    graph_distance: input.graphDistance,
    process_fit: input.processFit,
    dependency_fanout: input.dependencyFanout,
    feature_label_confidence: input.featureLabelConfidence,
    source_revision_match: input.sourceRevisionMatch,
    representation_revision_match: input.representationRevisionMatch,
    created_at: input.createdAt ?? new Date().toISOString(),
  });
}
