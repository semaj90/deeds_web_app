import { z } from 'zod';

export type RecommendationDecision =
  | 'patch_existing'
  | 'merge_card'
  | 'create_card'
  | 'ask_permission';

export type RecommendationPermissionLevel = 'patch_allowed' | 'read_only';

export type RecommendationAction =
  | 'repair_qdrant_identity_bridge'
  | 'backfill_summary_embeddings'
  | 'run_graph_expansion_proof'
  | 'rerun_sparse_population'
  | 'open_blocked_task'
  | 'generate_research_artifact'
  | 'generate_infographic'
  | 'stop_evidence_sufficient';

const EvidenceSchema = z.object({
  rg_matches: z.array(z.string()),
  ast_matches: z.array(z.unknown()),
  qdrant_hits: z.number().int().nonnegative(),
  graph_hits: z.number().int().nonnegative(),
  cache_hits: z.number().int().nonnegative(),
  rerank_score: z.number().min(0).max(1),
});

const Gemma4Schema = z.object({
  summary: z.string(),
  risk: z.enum(['low', 'medium', 'high']),
  rationale: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
});

export const RecommendationSchema = z.object({
  source_id: z.string(),
  source_ref: z.string(),
  normalized_source_ref: z.string(),
  feature_id: z.string().optional().nullable(),
  feature_label: z.string().optional().nullable(),
  packet_key: z.string().optional().nullable(),
  identity_lane: z.string().optional().nullable(),
  community_id: z.string().optional().nullable(),
  tree_node_id: z.string().optional().nullable(),
  qdrant_point_id: z.union([z.string(), z.number()]).optional().nullable(),
  kanban_card_id: z.string().optional().nullable(),
  decision: z.enum(['patch_existing', 'merge_card', 'create_card', 'ask_permission']),
  permission_level: z.enum(['patch_allowed', 'read_only']),
  target_files: z.array(z.string()),
  evidence: EvidenceSchema,
  gemma4: Gemma4Schema,
  validation_commands: z.array(z.string()),
  supersedes: z.array(z.string()),
  merged_from: z.array(z.string()),
  do_not_do: z.array(z.string()),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;
export type RecommendationEvidence = z.infer<typeof EvidenceSchema>;
export type RecommendationGemma4 = z.infer<typeof Gemma4Schema>;

const finiteProbability = z.number().finite().min(0).max(1);
const nonEmptyStringArray = z.array(z.string().min(1));

/**
 * Canonical recommendation tree-node identity.
 *
 * This is intentionally separate from packet identity and recommendation_id.
 * It identifies the parsed structural entity that may be referenced by many
 * derived stores and recommendation records.
 */
export const RecommendationTreeNodeIdentitySchema = z
  .object({
    tree_node_id: z.string().min(1),
    node_type: z.enum(['file', 'module', 'function', 'class', 'interface', 'enum', 'subsystem', 'symbol']),
    symbol_name: z.string().min(1).nullable(),
    source_ref: z.string().min(1),
    start_byte: z.number().int().nonnegative().nullable(),
    end_byte: z.number().int().nonnegative().nullable(),
    content_hash: z.string().min(1),
    parser_name: z.string().min(1),
    parser_language: z.string().min(1),
    parser_version: z.string().min(1),
    packet_key: z.string().min(1).nullable().optional(),
    feature_id: z.string().min(1).nullable().optional(),
  })
  .strict();

export type RecommendationTreeNodeIdentity = z.infer<typeof RecommendationTreeNodeIdentitySchema>;

const RecommendationFeatureValueKeys = {
  semantic_similarity: true,
  normalized_semantic_similarity: true,
  raw_semantic_similarity: true,
  sparse_score: true,
  normalized_sparse_score: true,
  raw_sparse_score: true,
  lexical_score: true,
  normalized_lexical_score: true,
  raw_lexical_score: true,
  graph_distance: true,
  page_rank_percentile: true,
  authority_percentile: true,
  authority_band: true,
  page_rank_raw: true,
  kmeans_cluster_compatibility: true,
  som_neighborhood_distance: true,
  domain_match: true,
  symbol_match: true,
  language_match: true,
  incoming_dependency_count: true,
  outgoing_dependency_count: true,
  file_recency: true,
  error_frequency: true,
  prior_task_success_rate: true,
  candidate_token_cost: true,
  estimated_latency_ms: true,
  identity_resolved: true,
  content_hash_verified: true,
  source_snapshot_current: true,
  has_semantic_score: true,
  has_sparse_score: true,
  has_graph_features: true,
  has_historical_outcome: true,
  feature_schema_version: true,
} as const;

const featureValueSchema = z
  .object({
    semantic_similarity: finiteProbability.nullable().optional(),
    normalized_semantic_similarity: finiteProbability.nullable().optional(),
    raw_semantic_similarity: z.number().finite().nullable().optional(),
    sparse_score: finiteProbability.nullable().optional(),
    normalized_sparse_score: finiteProbability.nullable().optional(),
    raw_sparse_score: z.number().finite().nullable().optional(),
    lexical_score: finiteProbability.nullable().optional(),
    normalized_lexical_score: finiteProbability.nullable().optional(),
    raw_lexical_score: z.number().finite().nullable().optional(),
    graph_distance: z.number().int().nonnegative().nullable().optional(),
    page_rank_percentile: finiteProbability.nullable().optional(),
    authority_percentile: finiteProbability.nullable().optional(),
    authority_band: z.string().min(1).nullable().optional(),
    page_rank_raw: z.number().finite().nullable().optional(),
    kmeans_cluster_compatibility: finiteProbability.nullable().optional(),
    som_neighborhood_distance: finiteProbability.nullable().optional(),
    domain_match: finiteProbability.nullable().optional(),
    symbol_match: finiteProbability.nullable().optional(),
    language_match: finiteProbability.nullable().optional(),
    incoming_dependency_count: z.number().int().nonnegative().nullable().optional(),
    outgoing_dependency_count: z.number().int().nonnegative().nullable().optional(),
    file_recency: finiteProbability.nullable().optional(),
    error_frequency: finiteProbability.nullable().optional(),
    prior_task_success_rate: finiteProbability.nullable().optional(),
    candidate_token_cost: z.number().int().nonnegative().nullable().optional(),
    estimated_latency_ms: z.number().int().nonnegative().nullable().optional(),
    identity_resolved: z.boolean().optional(),
    content_hash_verified: z.boolean().optional(),
    source_snapshot_current: z.boolean().optional(),
    has_semantic_score: z.boolean().optional(),
    has_sparse_score: z.boolean().optional(),
    has_graph_features: z.boolean().optional(),
    has_historical_outcome: z.boolean().optional(),
    feature_schema_version: z.string().min(1),
  })
  .passthrough()
  .superRefine((features, ctx) => {
    for (const key of Object.keys(features)) {
      if (/(tensor|tokenizer|token_ids?|embedding_vector)/i.test(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'Recommendation features must be reconstructable scalar values, not model tensors or tokenizer IDs.',
        });
      }
      if (!(key in RecommendationFeatureValueKeys)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `Unknown recommendation feature key: ${key}`,
        });
      }
    }
  });

export const RecommendationFeaturesSchema = featureValueSchema;
export type RecommendationFeatures = z.infer<typeof RecommendationFeaturesSchema>;

export const RecommendationScoreSchema = z
  .object({
    recommendation_id: z.string().min(1),
    query_id: z.string().min(1),
    candidate_id: z.string().min(1),
    packet_key: z.string().min(1),
    tree_node_id: z.string().min(1).nullable(),
    heuristic_relevance_score: z.number().finite().nullable(),
    ranker_score: z.number().finite().nullable(),
    usefulness_probability: finiteProbability,
    confidence: finiteProbability,
    estimated_context_tokens: z.number().int().nonnegative(),
    estimated_tokens_avoided: z.number().int().nonnegative(),
    estimated_latency_ms: z.number().int().nonnegative(),
    reason_codes: nonEmptyStringArray.min(1),
    feature_schema_version: z.string().min(1),
    ranker_model_version: z.string().min(1),
    calibration_version: z.string().min(1),
  })
  .strict();

export type RecommendationScore = z.infer<typeof RecommendationScoreSchema>;

export const RecommendationRecordSchema = z
  .object({
    recommendation_id: z.string().min(1),
    query_id: z.string().min(1),
    candidate_tree_node_id: z.string().min(1),
    usefulness_probability: finiteProbability,
    confidence: finiteProbability,
    ranker_model_id: z.string().min(1),
    feature_contract_version: z.string().min(1),
    feature_values: RecommendationFeaturesSchema,
    evidence_refs: nonEmptyStringArray.min(1),
    reason_codes: nonEmptyStringArray.min(1),
    corpus_snapshot_id: z.string().min(1),
    graph_projection_id: z.string().min(1).nullable(),
    created_at: z.string().datetime(),
  })
  .strict();

const ACPGraphPathSchema = z
  .object({
    nodes: nonEmptyStringArray.min(2).max(4),
    edges: nonEmptyStringArray.min(1).max(3),
    path_score: finiteProbability,
  })
  .strict()
  .superRefine((path, ctx) => {
    if (path.edges.length !== path.nodes.length - 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['edges'],
        message: 'Graph path edges must connect adjacent graph path nodes.',
      });
    }
  });

const ACPRecommendationCandidateSchema = z
  .object({
    tree_node_id: z.string().min(1),
    source_ref: z.string().min(1),
    relevance_probability: finiteProbability,
    reason_codes: nonEmptyStringArray.min(1),
    evidence_refs: nonEmptyStringArray.min(1),
    estimated_context_tokens: z.number().int().nonnegative(),
    graph_paths: z.array(ACPGraphPathSchema).max(20),
  })
  .strict();

export const ACPRecommendationPacketSchema = z
  .object({
    contract: z.literal('atlas.acp.recommendation.v1'),
    query_id: z.string().min(1),
    intent: z.string().min(1),
    candidates: z.array(ACPRecommendationCandidateSchema).min(1).max(20),
    budget: z
      .object({
        max_source_files: z.number().int().min(1).max(20),
        max_raw_tokens: z.number().int().min(1),
        max_tool_calls: z.number().int().min(1),
        max_graph_hops: z.number().int().min(0).max(3),
      })
      .strict(),
    permissions: z
      .object({
        mode: z.enum(['read_only', 'proposal_only', 'patch_allowed']),
        allowed_roots: nonEmptyStringArray.min(1),
      })
      .strict(),
    corpus_snapshot_id: z.string().min(1),
  })
  .strict()
  .superRefine((packet, ctx) => {
    const totalTokens = packet.candidates.reduce((sum, candidate) => sum + candidate.estimated_context_tokens, 0);
    if (totalTokens > packet.budget.max_raw_tokens) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates'], message: 'ACP candidates exceed the raw token budget.' });
    }

    const sourceRefs = new Set(packet.candidates.map((candidate) => candidate.source_ref));
    if (sourceRefs.size > packet.budget.max_source_files) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates'], message: 'ACP candidates exceed the source file budget.' });
    }

    for (const [candidateIndex, candidate] of packet.candidates.entries()) {
      if (!packet.permissions.allowed_roots.some((root) => candidate.source_ref === root || candidate.source_ref.startsWith(`${root}/`))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['candidates', candidateIndex, 'source_ref'],
          message: 'Candidate source_ref is outside the permitted roots.',
        });
      }
      for (const [pathIndex, graphPath] of candidate.graph_paths.entries()) {
        if (graphPath.edges.length > packet.budget.max_graph_hops) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['candidates', candidateIndex, 'graph_paths', pathIndex],
            message: 'Graph path exceeds the packet hop budget.',
          });
        }
      }
    }
  });

export const TaskPromotionGateSchema = z
  .object({
    recommendation_id: z.string().min(1),
    retrieval_confidence: finiteProbability,
    evidence_completeness: finiteProbability,
    duplicate_task_probability: finiteProbability,
    actionable: z.boolean(),
    affected_paths_known: z.boolean(),
    acceptance_criteria_present: z.boolean(),
    permissions_resolved: z.boolean(),
    permission_mode: z.enum(['read_only', 'proposal_only', 'patch_allowed']).optional(),
    gate_decision: z.enum(['PROMOTE', 'REVIEW_REQUIRED', 'REJECT']),
    failure_reasons: z.array(z.string().min(1)),
  })
  .strict();

export type TaskPromotionGate = z.infer<typeof TaskPromotionGateSchema>;
export type TaskPromotionGateInput = Omit<TaskPromotionGate, 'gate_decision' | 'failure_reasons'>;

export function evaluateTaskPromotion(input: TaskPromotionGateInput): TaskPromotionGate {
  const failureReasons: string[] = [];

  if (!input.actionable) failureReasons.push('NOT_ACTIONABLE');
  if (!input.acceptance_criteria_present) failureReasons.push('MISSING_ACCEPTANCE_CRITERIA');
  if (input.permission_mode === 'read_only') failureReasons.push('READ_ONLY_PERMISSION');
  if (failureReasons.length > 0) {
    return TaskPromotionGateSchema.parse({ ...input, gate_decision: 'REJECT', failure_reasons: failureReasons });
  }

  if (!input.affected_paths_known) failureReasons.push('AFFECTED_PATHS_UNKNOWN');
  if (!input.permissions_resolved) failureReasons.push('PERMISSIONS_UNRESOLVED');
  if (input.retrieval_confidence < 0.8) failureReasons.push('RETRIEVAL_CONFIDENCE_BELOW_THRESHOLD');
  if (input.evidence_completeness < 0.85) failureReasons.push('EVIDENCE_COMPLETENESS_BELOW_THRESHOLD');
  if (input.duplicate_task_probability > 0.2) failureReasons.push('DUPLICATE_TASK_RISK');

  return TaskPromotionGateSchema.parse({
    ...input,
    gate_decision: failureReasons.length === 0 ? 'PROMOTE' : 'REVIEW_REQUIRED',
    failure_reasons: failureReasons,
  });
}

export type RecommendationRecord = z.infer<typeof RecommendationRecordSchema>;
export type ACPRecommendationPacket = z.infer<typeof ACPRecommendationPacketSchema>;
