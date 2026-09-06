/**
 * HelperCardV1 — non-LLM capability registry for EmbeddingGemma-based pre-LLM routing.
 *
 * Per `openspec/changes/parent-atlas-retrieval-staging-planes/specs/ace-helper-card-routing/spec.md`:
 * EmbeddingGemma was explicitly trained with separate prompts for code retrieval, classification,
 * and clustering — this lets the same embedding model route a query to the cheapest adequate
 * non-LLM helper (ast-grep owner-finder, ts-morph symbol resolver, Postgres FTS search, Qdrant
 * semantic search, graph neighborhood expansion, web search, migration auditor, test finder, etc.)
 * before any generative LLM call, without introducing a second embedding model.
 *
 * `semantic768Ref` is a pointer to a precomputed embedding, never an inline vector — bulk numeric
 * arrays must not be serialized through this JSON-shaped contract (root CLAUDE.md, "Wire Format
 * Layering Rule").
 */

import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);

export const HELPER_INVOCATION_COST_CLASS_VALUES = ['CHEAP', 'MEDIUM', 'EXPENSIVE'] as const;
export const helperInvocationCostClassSchema = z.enum(HELPER_INVOCATION_COST_CLASS_VALUES);

export const HelperCardV1Schema = z.object({
  schema: z.literal('atlas.helper-card.v1').default('atlas.helper-card.v1'),
  helperId: id,
  capabilities: z.string().min(1),
  supportedTaskFamilies: z.array(z.string().min(1)).min(1),
  invocationCostClass: helperInvocationCostClassSchema,
  evidenceRequirements: z.array(z.string()).default([]),
  semantic768Ref: id,
  revision,
}).strict();

export type HelperCardV1 = z.infer<typeof HelperCardV1Schema>;

/**
 * A routing candidate produced by scoring one query against the registered `HelperCardV1` set.
 * `similarity` is the EmbeddingGemma cosine/dot score between the query embedding and the card's
 * `semantic768Ref` vector — never recomputed against a different model.
 */
export const HelperRoutingCandidateV1Schema = z.object({
  helperId: id,
  similarity: z.number().finite().min(-1).max(1),
  rank: z.number().int().nonnegative(),
}).strict();

export type HelperRoutingCandidateV1 = z.infer<typeof HelperRoutingCandidateV1Schema>;

/** Confidence floor above which the router may dispatch directly without an LLM decision step. */
export const HELPER_ROUTING_DIRECT_DISPATCH_THRESHOLD = 0.75;

export function canDispatchDirectly(candidate: HelperRoutingCandidateV1): boolean {
  return candidate.rank === 0 && candidate.similarity >= HELPER_ROUTING_DIRECT_DISPATCH_THRESHOLD;
}
