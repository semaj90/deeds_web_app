import { z } from 'zod';
import { RecommendationSchema } from './recommendation.js';

export const SEMANTIC_SIGNAL_SCHEMA_VERSION = 'atlas.semantic_signal.v1' as const;
export const ATLAS_RECOMMENDATION_SCHEMA_VERSION = 'atlas.recommendation.v1' as const;

export const SemanticSignalEvidenceRefSchema = z
  .object({
    source_ref: z.string().min(1),
    content_hash: z.string().min(1).optional().nullable(),
    packet_key: z.string().min(1).optional().nullable(),
    tree_node_id: z.string().min(1).optional().nullable(),
    evidence_kind: z.string().min(1),
    note: z.string().min(1).optional().nullable(),
  })
  .strict();

export const DomainLabelScoreSchema = z
  .object({
    label: z.string().min(1),
    score: z.number().min(0).max(1),
    source: z.enum(['deterministic', 'learned', 'weak_label', 'reviewed', 'fallback']),
    evidence_kinds: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const DomainClassificationV1Schema = z
  .object({
    schema_version: z.literal(SEMANTIC_SIGNAL_SCHEMA_VERSION),
    signal_type: z.literal('domain_classification'),
    subject_id: z.string().min(1),
    workspace_revision: z.string().min(1),
    producer: z.string().min(1),
    producer_revision: z.string().min(1),
    evidence_refs: z.array(SemanticSignalEvidenceRefSchema).min(1),
    labels: z.array(DomainLabelScoreSchema).min(0).max(8),
    primary_label: z.string().min(1).nullable(),
    secondary_labels: z.array(z.string().min(1)).max(8).default([]),
    confidence: z.number().min(0).max(1),
    ood_score: z.number().min(0).max(1).nullable().optional(),
    model_revision_state: z.enum(['PROVEN', 'NOT_PROVEN', 'SUPERSEDED']).default('NOT_PROVEN'),
    created_at: z.string().datetime(),
  })
  .strict();

export const QueryIntentScoreSchema = z
  .object({
    intent: z.string().min(1),
    score: z.number().min(0).max(1),
  })
  .strict();

export const QueryAnalysisV1Schema = z
  .object({
    schema_version: z.literal(SEMANTIC_SIGNAL_SCHEMA_VERSION),
    signal_type: z.literal('query_analysis'),
    subject_id: z.string().min(1),
    workspace_revision: z.string().min(1),
    producer: z.string().min(1),
    producer_revision: z.string().min(1),
    evidence_refs: z.array(SemanticSignalEvidenceRefSchema).min(0),
    intent_probabilities: z.array(QueryIntentScoreSchema).min(1).max(12),
    domain_probabilities: z.array(DomainLabelScoreSchema).min(0).max(8),
    extracted_entities: z.array(z.string().min(1)).default([]),
    requested_traversal_depth: z.number().int().min(0).max(3),
    uncertainty: z.number().min(0).max(1),
    schema_hints: z.array(z.string().min(1)).default([]),
    symbol_hints: z.array(z.string().min(1)).default([]),
    error_hints: z.array(z.string().min(1)).default([]),
    retrieval_scope: z.enum(['single_symbol', 'file', 'module', 'workspace', 'corpus']),
    recommended_lanes: z
      .array(z.enum(['dense', 'sparse', 'symbol', 'schema', 'graph', 'temporal', 'web', 'provenance']))
      .min(1)
      .max(8),
    created_at: z.string().datetime(),
  })
  .strict();

export const RetrievalLaneSchema = z.enum([
  'dense',
  'sparse',
  'symbol',
  'schema',
  'graph',
  'temporal',
  'web',
  'provenance',
]);

export const RetrievalPlanV1Schema = z
  .object({
    schema_version: z.literal(SEMANTIC_SIGNAL_SCHEMA_VERSION),
    signal_type: z.literal('retrieval_plan'),
    subject_id: z.string().min(1),
    workspace_revision: z.string().min(1),
    producer: z.string().min(1),
    producer_revision: z.string().min(1),
    evidence_refs: z.array(SemanticSignalEvidenceRefSchema).min(0),
    lanes: z.array(RetrievalLaneSchema).min(1).max(8),
    candidate_limits: z
      .object({
        dense: z.number().int().positive(),
        sparse: z.number().int().positive(),
        symbol: z.number().int().positive(),
        schema: z.number().int().positive(),
        graph: z.number().int().positive(),
        temporal: z.number().int().positive(),
        web: z.number().int().positive(),
        provenance: z.number().int().positive(),
      })
      .strict(),
    graph_limits: z
      .object({
        max_seeds: z.number().int().min(0).max(12),
        max_hops: z.number().int().min(0).max(3),
        max_nodes: z.number().int().min(0).max(80),
        max_edges: z.number().int().min(0).max(160),
        max_returned_facts: z.number().int().min(0).max(40),
      })
      .strict(),
    rerank_limit: z.number().int().min(0).max(128),
    final_evidence_limit: z.number().int().min(1).max(40),
    token_budget: z.number().int().positive(),
    allowed_filters: z.array(z.string().min(1)).default([]),
    provenance_required: z.boolean().default(true),
    created_at: z.string().datetime(),
  })
  .strict();

export const TraversalBudgetV1Schema = z
  .object({
    schema_version: z.literal(SEMANTIC_SIGNAL_SCHEMA_VERSION),
    signal_type: z.literal('traversal_budget'),
    subject_id: z.string().min(1),
    workspace_revision: z.string().min(1),
    producer: z.string().min(1),
    producer_revision: z.string().min(1),
    evidence_refs: z.array(SemanticSignalEvidenceRefSchema).min(0),
    max_seeds: z.number().int().min(0).max(12),
    max_hops: z.number().int().min(0).max(3),
    max_nodes: z.number().int().min(0).max(80),
    max_edges: z.number().int().min(0).max(160),
    max_returned_facts: z.number().int().min(0).max(40),
    max_queries_per_round: z.number().int().min(1).max(5),
    max_retrieval_rounds: z.number().int().min(1).max(3),
    third_hop_requires_reason: z.boolean().default(true),
    token_budget: z.number().int().positive(),
    created_at: z.string().datetime(),
  })
  .strict();

export const LoopStateSchema = z.enum([
  'UNDERSTAND',
  'CLASSIFY',
  'PLAN',
  'RETRIEVE',
  'EXPAND_GRAPH',
  'RERANK',
  'ASSEMBLE_CONTEXT',
  'GENERATE',
  'VALIDATE',
  'RECOVER',
  'WAIT_EXTERNAL',
  'COMPLETE',
]);

export const LoopObservationV1Schema = z
  .object({
    schema_version: z.literal(SEMANTIC_SIGNAL_SCHEMA_VERSION),
    signal_type: z.literal('loop_observation'),
    subject_id: z.string().min(1),
    workspace_revision: z.string().min(1),
    producer: z.string().min(1),
    producer_revision: z.string().min(1),
    evidence_refs: z.array(SemanticSignalEvidenceRefSchema).min(0),
    state: LoopStateSchema,
    tool: z.string().min(1),
    result: z.enum(['PASS', 'WARN', 'FAIL', 'PENDING']),
    retries: z.number().int().min(0),
    duplicate_calls: z.number().int().min(0),
    retrieval_count: z.number().int().min(0),
    reranker_margin: z.number().min(0).max(1).nullable().optional(),
    evidence_coverage: z.number().min(0).max(1),
    token_pressure: z.number().min(0).max(1),
    validation_state: z.enum(['PASS', 'WARN', 'FAIL']),
    error_class: z.string().min(1).nullable().optional(),
    semantic_drift_score: z.number().min(0).max(1),
    unsupported_claim_count: z.number().int().min(0),
    compaction_events: z.number().int().min(0),
    created_at: z.string().datetime(),
  })
  .strict();

export const ContinuityCheckpointV1Schema = z
  .object({
    schema_version: z.literal(SEMANTIC_SIGNAL_SCHEMA_VERSION),
    signal_type: z.literal('continuity_checkpoint'),
    subject_id: z.string().min(1),
    workspace_revision: z.string().min(1),
    producer: z.string().min(1),
    producer_revision: z.string().min(1),
    evidence_refs: z.array(SemanticSignalEvidenceRefSchema).min(0),
    active_goal: z.string().min(1),
    accepted_decisions: z.array(z.string().min(1)).default([]),
    rejected_hypotheses: z.array(z.string().min(1)).default([]),
    unresolved_questions: z.array(z.string().min(1)).default([]),
    current_plan_step: z.string().min(1),
    authority_constraints: z.array(z.string().min(1)).default([]),
    required_evidence_ids: z.array(z.string().min(1)).default([]),
    packet_revision: z.string().min(1),
    source_revision: z.string().min(1),
    compaction_count: z.number().int().min(0).default(0),
    created_at: z.string().datetime(),
  })
  .strict();

export const AtlasRecommendationV1Schema = z
  .object({
    schema_version: z.literal(ATLAS_RECOMMENDATION_SCHEMA_VERSION),
    signal_type: z.literal('recommendation'),
    recommendation_id: z.string().min(1),
    subject_id: z.string().min(1),
    workspace_revision: z.string().min(1),
    producer: z.string().min(1),
    producer_revision: z.string().min(1),
    problem: z.string().min(1),
    proposed_action: z.string().min(1),
    evidence_refs: z.array(SemanticSignalEvidenceRefSchema).min(1),
    inference_confidence: z.number().min(0).max(1),
    validation_plan: z
      .object({
        criteria: z.array(z.string().min(1)).min(1),
        rollback: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    lifecycle_state: z.enum([
      'PROPOSED',
      'EVIDENCE_GATHERING',
      'READY_FOR_REVIEW',
      'APPROVED',
      'IMPLEMENTED',
      'VALIDATED',
      'REJECTED',
      'SUPERSEDED',
    ]),
    created_at: z.string().datetime(),
  })
  .strict();

export const SemanticSignalV1Schema = z.discriminatedUnion('signal_type', [
  DomainClassificationV1Schema,
  QueryAnalysisV1Schema,
  RetrievalPlanV1Schema,
  TraversalBudgetV1Schema,
  LoopObservationV1Schema,
  ContinuityCheckpointV1Schema,
  AtlasRecommendationV1Schema,
]);

export const SemanticSignalProofStatusSchema = z.enum([
  'STATICALLY_PROVEN',
  'RUNTIME_PROVEN',
  'RUNTIME_PROOF_FAILED',
  'RUNTIME_PROOF_PENDING',
  'BLOCKED',
  'SUPERSEDED',
]);

export const SemanticSignalProofManifestV1Schema = z
  .object({
    schema_version: z.literal(SEMANTIC_SIGNAL_SCHEMA_VERSION),
    run_id: z.string().min(1),
    workspace_revision: z.string().min(1),
    producer: z.string().min(1),
    producer_revision: z.string().min(1),
    status: SemanticSignalProofStatusSchema,
    subject_count: z.number().int().nonnegative(),
    accepted_signals: z.number().int().nonnegative(),
    rejected_signals: z.number().int().nonnegative(),
    evidence_refs: z.array(z.string().min(1)).default([]),
    proof_notes: z.array(z.string().min(1)).default([]),
    created_at: z.string().datetime(),
  })
  .strict();

export type SemanticSignalEvidenceRef = z.infer<typeof SemanticSignalEvidenceRefSchema>;
export type DomainLabelScore = z.infer<typeof DomainLabelScoreSchema>;
export type DomainClassificationV1 = z.infer<typeof DomainClassificationV1Schema>;
export type QueryIntentScore = z.infer<typeof QueryIntentScoreSchema>;
export type QueryAnalysisV1 = z.infer<typeof QueryAnalysisV1Schema>;
export type RetrievalLane = z.infer<typeof RetrievalLaneSchema>;
export type RetrievalPlanV1 = z.infer<typeof RetrievalPlanV1Schema>;
export type TraversalBudgetV1 = z.infer<typeof TraversalBudgetV1Schema>;
export type LoopObservationV1 = z.infer<typeof LoopObservationV1Schema>;
export type ContinuityCheckpointV1 = z.infer<typeof ContinuityCheckpointV1Schema>;
export type AtlasRecommendationV1 = z.infer<typeof AtlasRecommendationV1Schema>;
export type SemanticSignalV1 = z.infer<typeof SemanticSignalV1Schema>;
export type SemanticSignalProofManifestV1 = z.infer<typeof SemanticSignalProofManifestV1Schema>;

