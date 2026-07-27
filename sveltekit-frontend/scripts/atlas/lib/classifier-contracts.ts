import { z } from 'zod';

/**
 * Canonical contracts for classifier training, evaluation, and prediction.
 * Version: 1.0.0
 * These schemas MUST match the JSON Schema Draft 2020-12 definitions in contracts.json.
 */

export const VectorManifestSchema = z.object({
  vector_name: z.literal('dense_768_legacy'),
  embedding_model: z.literal('embeddinggemma:latest'),
  embedding_model_revision: z.string(),
  dimensions: z.literal(768),
  distance_metric: z.literal('cosine'),
});

export const ClassifierSplitManifestSchema = z.object({
  schema_version: z.literal('1.0.0'),
  workspace_revision: z.string().describe('Postgres database identifier'),
  split_hash: z.string().regex(/^[a-f0-9]{64}$/),
  training_snapshot_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  vector_manifest: VectorManifestSchema,
  label_map_version: z.literal('1.0.0'),
  train_size: z.number().int().positive(),
  val_size: z.number().int().positive(),
  test_size: z.number().int().positive(),
  n_features: z.literal(768),
  n_classes: z.number().int().min(2),
  classes: z.array(z.string()).describe('Sorted canonical domain labels'),
  created_at: z.string().datetime(),
});

export const DomainFeaturePacketSchema = z.object({
  packet_key: z.string().regex(/^ace:packet:[a-z0-9_-]+$/),
  source_ref: z.string(),
  file_path: z.string(),
  feature_id: z.string(),
  feature_label: z.string(),
  domain_class: z.string(),
  embedding: z.array(z.number()).length(768),
  semantic_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  created_at: z.string().datetime(),
});

export const ModelRunManifestSchema = z.object({
  schema_version: z.literal('1.0.0'),
  classifier: z.enum(['logistic_regression', 'xgboost', 'pytorch_mlp']),
  model_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  dataset_hash: z.string().regex(/^[a-f0-9]{64}$/),
  model_version: z.literal('1.0'),
  training_timestamp: z.string().datetime(),
  metadata: z.object({
    train_size: z.number().int().positive(),
    n_classes: z.number().int().min(2),
    n_features: z.literal(768),
  }),
});

export const PerDomainMetricsSchema = z.object({
  precision: z.number().min(0).max(1),
  recall: z.number().min(0).max(1),
  f1: z.number().min(0).max(1),
  support: z.number().int().nonnegative(),
});

export const EvaluationReportSchema = z.object({
  schema_version: z.literal('1.0.0'),
  accuracy: z.number().min(0).max(1),
  macro_f1: z.number().min(0).max(1),
  weighted_f1: z.number().min(0).max(1),
  test_accuracy: z.number().min(0).max(1),
  test_macro_f1: z.number().min(0).max(1),
  gate_pass: z.boolean(),
  per_domain_metrics: z.record(z.string(), PerDomainMetricsSchema),
});

export const DomainPredictionSchema = z.object({
  packet_key: z.string(),
  predicted_domain: z.string(),
  raw_scores: z.record(z.string(), z.number()),
  top_score: z.number().min(0).max(1),
  score_margin: z.number(),
  status: z.enum(['PREDICTED', 'UNCERTAIN', 'REJECTED']),
});

// Phase 1.5: Multi-Domain Ontology
export const DomainOntologyLabelSchema = z.object({
  domain: z.string(),
  canonical_label: z.string(),
  tier: z.enum(['tier1_root', 'tier2_major', 'tier3_specific']),
  parent_domain: z.string().nullable(),
  keywords: z.array(z.string()),
  description: z.string(),
});

// Phase 2: Multi-Signal Evidence Linking
export const EvidenceLanesSchema = z.object({
  semantic: z.number().min(0).max(1).describe('Embedding cosine similarity'),
  lexical: z.number().min(0).max(1).describe('BM25 lexical match'),
  structural: z.number().min(0).max(1).describe('AST/import graph'),
  topology: z.number().min(0).max(1).describe('PageRank/SOM neighborhood'),
  recency: z.number().min(0).max(1).describe('Temporal freshness'),
});

export const LinkedSemanticTupleSchema = z.object({
  source_packet_key: z.string().regex(/^ace:packet:[a-z0-9_-]+$/),
  target_packet_key: z.string().regex(/^ace:packet:[a-z0-9_-]+$/),
  evidence_lanes: EvidenceLanesSchema,
  combined_score: z.number().min(0).max(1).describe('RRF-fused score'),
  created_at: z.string().datetime(),
});

// Phase 2: Ranked Retrieval Result
export const RetrievalCandidateSchema = z.object({
  packet_key: z.string().regex(/^ace:packet:[a-z0-9_-]+$/),
  rank: z.number().int().positive(),
  rrf_score: z.number().min(0),
  evidence_signals: EvidenceLanesSchema,
  domain_boosts: z.record(z.string(), z.number()).describe('Naive Bayes domain probability boosts'),
  matching_domains: z.array(z.string()).describe('Domains this packet belongs to'),
});

// Phase 2: Feature Vector for XGBoost Ranker
export const RankerFeaturesSchema = z.object({
  semantic_score: z.number().describe('Query-packet embedding cosine similarity'),
  bm25_score: z.number().describe('BM25 ranking score (normalized 0-1)'),
  domain_entropy: z.number().describe('Shannon entropy of domain_memberships'),
  tree_node_distance: z.number().describe('Minimum graph distance to query source'),
  page_rank_score: z.number().describe('PageRank authority score (0-1)'),
  recency_days: z.number().describe('Days since last update (log scale)'),
});

export const RankerFeatureEnvelopeSchema = z.object({
  query_id: z.string(),
  packet_key: z.string().regex(/^ace:packet:[a-z0-9_-]+$/),
  relevance_label: z.number().int().min(0).max(3).describe('0=irrelevant, 1=marginal, 2=relevant, 3=highly_relevant'),
  features: RankerFeaturesSchema,
});

// Type exports for TypeScript consumers
export type VectorManifest = z.infer<typeof VectorManifestSchema>;
export type ClassifierSplitManifest = z.infer<typeof ClassifierSplitManifestSchema>;
export type DomainFeaturePacket = z.infer<typeof DomainFeaturePacketSchema>;
export type ModelRunManifest = z.infer<typeof ModelRunManifestSchema>;
export type EvaluationReport = z.infer<typeof EvaluationReportSchema>;
export type DomainPrediction = z.infer<typeof DomainPredictionSchema>;
export type DomainOntologyLabel = z.infer<typeof DomainOntologyLabelSchema>;
export type LinkedSemanticTuple = z.infer<typeof LinkedSemanticTupleSchema>;
export type RetrievalCandidate = z.infer<typeof RetrievalCandidateSchema>;
export type RankerFeatureEnvelope = z.infer<typeof RankerFeatureEnvelopeSchema>;

/**
 * Validates a split manifest against the canonical schema.
 * Returns { success: true, data } or { success: false, error }
 */
export function validateSplitManifest(data: unknown): z.SafeParseReturnType<unknown, ClassifierSplitManifest> {
  return ClassifierSplitManifestSchema.safeParse(data);
}

/**
 * Validates an evaluation report against the canonical schema.
 */
export function validateEvaluationReport(data: unknown): z.SafeParseReturnType<unknown, EvaluationReport> {
  return EvaluationReportSchema.safeParse(data);
}

/**
 * Validates a domain prediction against the canonical schema.
 */
export function validatePrediction(data: unknown): z.SafeParseReturnType<unknown, DomainPrediction> {
  return DomainPredictionSchema.safeParse(data);
}

/**
 * Validates a domain ontology label (Phase 1.5).
 */
export function validateDomainOntologyLabel(data: unknown): z.SafeParseReturnType<unknown, DomainOntologyLabel> {
  return DomainOntologyLabelSchema.safeParse(data);
}

/**
 * Validates a linked semantic tuple (multi-signal evidence).
 */
export function validateLinkedSemanticTuple(data: unknown): z.SafeParseReturnType<unknown, LinkedSemanticTuple> {
  return LinkedSemanticTupleSchema.safeParse(data);
}

/**
 * Validates a retrieval candidate (ranked result).
 */
export function validateRetrievalCandidate(data: unknown): z.SafeParseReturnType<unknown, RetrievalCandidate> {
  return RetrievalCandidateSchema.safeParse(data);
}

/**
 * Validates a ranker feature envelope (training data).
 */
export function validateRankerFeatureEnvelope(data: unknown): z.SafeParseReturnType<unknown, RankerFeatureEnvelope> {
  return RankerFeatureEnvelopeSchema.safeParse(data);
}

// Phase 3: Proof Matrix & Evidence Ledger
export const EvidenceObservationSchema = z.object({
  observation_id: z.string().regex(/^obs:[a-z0-9_-]+$/),
  packet_key: z.string().regex(/^ace:packet:[a-z0-9_-]+$/),
  observation_type: z.enum([
    'semantic_embedding',
    'lexical_bm25',
    'structural_ast',
    'topology_pagerank',
    'topology_som',
    'domain_membership',
    'recency_metadata',
    'identity_resolution',
  ]),
  evidence_lane: z.enum(['semantic', 'lexical', 'structural', 'topology', 'recency', 'identity']),
  value: z.union([z.number(), z.string(), z.array(z.any()), z.record(z.any())]),
  confidence: z.number().min(0).max(1).describe('Measurement confidence'),
  source: z.enum(['postgres', 'qdrant', 'neo4j', 'computed', 'manual']),
  observed_at: z.string().datetime(),
  metadata: z.record(z.any()).optional().describe('Optional context'),
});

export const MutationProposalSchema = z.object({
  proposal_id: z.string().regex(/^mut:[a-z0-9_-]+$/),
  packet_key: z.string().regex(/^ace:packet:[a-z0-9_-]+$/),
  mutation_type: z.enum([
    'domain_membership_update',
    'identity_correction',
    'feature_extraction',
    'feature_correction',
    'label_override',
    'confidence_adjustment',
  ]),
  changes: z.record(z.any()).describe('Fields to change: {field: new_value, ...}'),
  justification: z.string(),
  observations_supporting: z.array(z.string().regex(/^obs:[a-z0-9_-]+$/)),
  status: z.enum(['proposed', 'under_review', 'approved', 'applied', 'rejected']).optional(),
  created_at: z.string().datetime(),
  applied_at: z.string().datetime().nullable().optional(),
  applied_by: z.string().nullable().optional(),
});

// Type exports
export type EvidenceObservation = z.infer<typeof EvidenceObservationSchema>;
export type MutationProposal = z.infer<typeof MutationProposalSchema>;

/**
 * Validates an evidence observation (proof matrix entry).
 */
export function validateEvidenceObservation(data: unknown): z.SafeParseReturnType<unknown, EvidenceObservation> {
  return EvidenceObservationSchema.safeParse(data);
}

/**
 * Validates a mutation proposal (before application).
 */
export function validateMutationProposal(data: unknown): z.SafeParseReturnType<unknown, MutationProposal> {
  return MutationProposalSchema.safeParse(data);
}
