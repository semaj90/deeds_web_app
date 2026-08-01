/**
 * Deterministic retrieval query plan — the *output* of query planning, not
 * the plan-generation logic itself.
 *
 * Rules-based / lightweight-NLP planners produce this shape. An LLM
 * (Gemma4 or otherwise) must not decide the base retrieval plan directly
 * from raw repository content — this schema exists precisely so the plan
 * stays a bounded, auditable structure instead of prose that has to be
 * re-parsed downstream.
 *
 * See openspec/changes/parent-atlas-runtime-ownership-precall/design.md
 * ("Deterministic query planning") for the rationale.
 */

import { z } from 'zod';

export const QueryPlanSchema = z.object({
  intent: z.enum([
    'exact_symbol',
    'semantic_search',
    'schema_lookup',
    'dependency_analysis',
    'error_diagnosis',
    'repair_target',
    'research',
  ]),
  lexicalQueries: z.array(z.string()).max(6),
  symbolHints: z.array(z.string()).max(20),
  retrievalLanes: z.array(
    z.enum(['exact', 'rg', 'bm25', 'semantic_768', 'ast', 'schema', 'graph', 'centroid'])
  ),
  topK: z.number().int().min(1).max(100),
  graphHops: z.number().int().min(0).max(3),
  needsEmbedding: z.boolean(),
});

export type QueryPlan = z.infer<typeof QueryPlanSchema>;
