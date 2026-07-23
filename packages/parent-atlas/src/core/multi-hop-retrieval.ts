import { z } from 'zod';
import { retrievalCandidateSchema } from './retrieval-candidate.js';

export const temporalRetrievalModeSchema = z.enum(['current-only', 'as-of', 'compare-version']);

export const retrievalLaneSchema = z.enum(['dense', 'sparse', 'summary', 'exact', 'ast', 'graph', 'temporal']);

export const multiHopRetrievalConfigSchema = z.object({
  seed_count: z.number().int().positive(),
  per_seed_neighbor_limit: z.number().int().positive(),
  maximum_hop_count: z.number().int().min(0).max(2),
  allowed_relationship_types: z.array(z.string().min(1)).default([]),
  hop_decay: z.number().min(0).max(1),
  total_graph_candidate_budget: z.number().int().positive(),
  final_rerank_depth: z.number().int().positive(),
});

export const temporalRetrievalPolicySchema = z.object({
  mode: temporalRetrievalModeSchema,
  as_of: z.string().min(1).nullable().optional(),
  compare_from: z.string().min(1).nullable().optional(),
  compare_to: z.string().min(1).nullable().optional(),
});

export const multiHopRetrievalQuerySchema = z.object({
  query: z.string().min(1),
  query_id: z.string().min(1),
  intent: z.string().min(1),
  domain_class: z.string().min(1).nullable().optional(),
  config: multiHopRetrievalConfigSchema,
  temporal_policy: temporalRetrievalPolicySchema,
});

export const multiHopRetrievalResultSchema = z.object({
  query: z.string().min(1),
  query_id: z.string().min(1),
  config: multiHopRetrievalConfigSchema,
  temporal_policy: temporalRetrievalPolicySchema,
  candidates: z.array(retrievalCandidateSchema),
  seed_packet_keys: z.array(z.string().min(1)).default([]),
  graph_hops_executed: z.number().int().min(0).max(2),
  rrf_applied: z.boolean(),
  reranked_depth: z.number().int().nonnegative(),
  hydrated_packet_keys: z.array(z.string().min(1)).default([]),
  evidence_refs: z.array(z.string().min(1)).default([]),
});

export type MultiHopRetrievalConfig = z.infer<typeof multiHopRetrievalConfigSchema>;
export type TemporalRetrievalPolicy = z.infer<typeof temporalRetrievalPolicySchema>;
export type MultiHopRetrievalQuery = z.infer<typeof multiHopRetrievalQuerySchema>;
export type MultiHopRetrievalResult = z.infer<typeof multiHopRetrievalResultSchema>;

export function buildMultiHopRetrievalConfig(input: unknown): MultiHopRetrievalConfig {
  return multiHopRetrievalConfigSchema.parse(input);
}

export function buildTemporalRetrievalPolicy(input: unknown): TemporalRetrievalPolicy {
  return temporalRetrievalPolicySchema.parse(input);
}

export function buildMultiHopRetrievalQuery(input: unknown): MultiHopRetrievalQuery {
  return multiHopRetrievalQuerySchema.parse(input);
}

export function buildMultiHopRetrievalResult(input: unknown): MultiHopRetrievalResult {
  return multiHopRetrievalResultSchema.parse(input);
}
