import type { QueryClassificationV1 } from './query-classifier.js';
import type { RetrievalPlanV1 } from './retrieval-plan.js';

export const REDUCTION_POLICY_V1_SCHEMA = 'parent-atlas.reduction-policy.v1' as const;

export type RetrievalHelperV1 =
  | 'ACTION_GRAM'
  | 'METADATA'
  | 'RG'
  | 'AST_GREP'
  | 'TS_MORPH'
  | 'SEMANTIC'
  | 'GRAPH'
  | 'WEB'
  | 'SQL'
  | 'OAK'
  | 'PYTHON_EVAL';

export interface ReductionPolicyV1 {
  schema: typeof REDUCTION_POLICY_V1_SCHEMA;
  workspaceRevision: string;
  exactFirst: true;
  exactPromotionRequired: boolean;
  helperOrder: readonly RetrievalHelperV1[];
  conditionalHelpers: readonly RetrievalHelperV1[];
  maxCandidateExpansion: number;
  maxGraphExpansions: number;
  mutationAllowed: boolean;
  requiresFreshWeb: boolean;
}

export function buildReductionPolicyV1(input: {
  classification: QueryClassificationV1;
  plan: RetrievalPlanV1;
  requiresFreshWeb?: boolean;
  maxCandidateExpansion?: number;
}): ReductionPolicyV1 {
  // FIXED 2026-09-06 (review before bringing this pack into the repo, per
  // openspec/changes/parent-atlas-memory-architecture-freeze addendum 9):
  // QueryClassificationV1.requiresMutation is already a real, typed field
  // (src/lib/server/atlas/agentic-file-compiler/query-classifier.ts) - the
  // original `(input.classification as unknown as { requiresMutation?:
  // boolean }).requiresMutation` cast was both unnecessary and a type-safety
  // hole (it would have silently compiled even if the real field were ever
  // renamed).
  const mutationAllowed = input.classification.requiresMutation;

  const base: RetrievalHelperV1[] = ['ACTION_GRAM', 'METADATA', 'RG', 'AST_GREP'];
  const conditional: RetrievalHelperV1[] = ['TS_MORPH', 'SEMANTIC', 'GRAPH'];

  if (input.requiresFreshWeb) conditional.push('WEB');

  return {
    schema: REDUCTION_POLICY_V1_SCHEMA,
    workspaceRevision: input.plan.workspaceRevision,
    exactFirst: true,
    exactPromotionRequired: input.plan.exactPromotionRequired,
    helperOrder: base,
    conditionalHelpers: conditional,
    maxCandidateExpansion: Math.max(
      1,
      Math.min(input.maxCandidateExpansion ?? input.plan.candidateBudget, input.plan.candidateBudget)
    ),
    maxGraphExpansions: input.plan.hyperedgeExpansionBudget,
    mutationAllowed,
    requiresFreshWeb: Boolean(input.requiresFreshWeb)
  };
}
