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
