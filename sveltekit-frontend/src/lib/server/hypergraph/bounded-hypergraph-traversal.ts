import type { TraversalResult } from './hypergraph-types.js';
import {
  traverseMultihopBounded,
  type HypergraphTraversalBudget,
} from './hypergraph-traversal.js';

export interface HypergraphExpansionBudgetV1 extends HypergraphTraversalBudget {
  policyRevision: string;
}

export interface BoundedTraversalResult extends TraversalResult {
  budget: HypergraphExpansionBudgetV1;
  exhaustedBy: Array<'edges' | 'members' | 'hops' | 'tokens' | 'millis'>;
  estimatedTokens: number;
  memberCount: number;
}

/**
 * Contract-level facade over the existing HyperGraphRAG traversal owner.
 * Actual resource limits are enforced inside hypergraph-traversal.ts while the
 * store is being queried, rather than truncating an already-expanded result.
 */
export async function traverseHypergraphBounded(
  anchorKey: string,
  budget: HypergraphExpansionBudgetV1,
  limitPerHop = 20,
): Promise<BoundedTraversalResult> {
  const result = await traverseMultihopBounded(anchorKey, budget, limitPerHop);
  return { ...result, budget };
}
