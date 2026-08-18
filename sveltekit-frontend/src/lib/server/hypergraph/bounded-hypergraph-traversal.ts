import type { Hyperedge, TraversalResult, TraversalStep } from './hypergraph-types.js';
import { traverseMultihop } from './hypergraph-traversal.js';

export interface HypergraphExpansionBudgetV1 {
  maxEdges: number;
  maxMembers: number;
  maxHops: number;
  maxTokens: number;
  maxMillis: number;
  policyRevision: string;
}

export interface BoundedTraversalResult extends TraversalResult {
  budget: HypergraphExpansionBudgetV1;
  exhaustedBy: Array<'edges' | 'members' | 'hops' | 'tokens' | 'millis'>;
  estimatedTokens: number;
  memberCount: number;
}

const estimateTokens = (value: string) => Math.max(1, Math.ceil(value.length / 4));

/**
 * Bounded facade over the existing HyperGraphRAG traversal owner.
 *
 * This intentionally does not create another hypergraph store or relation model.
 * It caps the evidence returned by the existing traversal so downstream context
 * compilation has an explicit finite envelope. The canonical edge/membership
 * objects are returned unchanged.
 */
export async function traverseHypergraphBounded(
  anchorKey: string,
  budget: HypergraphExpansionBudgetV1,
  limitPerHop = 20,
): Promise<BoundedTraversalResult> {
  const started = Date.now();
  const raw = await traverseMultihop(anchorKey, Math.max(0, budget.maxHops), limitPerHop);
  const exhaustedBy: BoundedTraversalResult['exhaustedBy'] = [];
  const edges: Hyperedge[] = [];
  let memberCount = 0;
  let estimatedTokens = 0;

  for (const edge of raw.edges) {
    const edgeTokens = estimateTokens(edge.label ?? edge.edge_type) +
      edge.members.reduce((total, member) => total + estimateTokens(member.member_key), 0);
    const nextMemberCount = memberCount + edge.members.length;

    if (edges.length >= budget.maxEdges) { exhaustedBy.push('edges'); break; }
    if (nextMemberCount > budget.maxMembers) { exhaustedBy.push('members'); break; }
    if (estimatedTokens + edgeTokens > budget.maxTokens) { exhaustedBy.push('tokens'); break; }
    if (Date.now() - started > budget.maxMillis) { exhaustedBy.push('millis'); break; }

    edges.push(edge);
    memberCount = nextMemberCount;
    estimatedTokens += edgeTokens;
  }

  if (raw.totalHops >= budget.maxHops) exhaustedBy.push('hops');

  const allowedMemberKeys = new Set(edges.flatMap((edge) => edge.members.map((member) => member.member_key)));
  const steps: TraversalStep[] = raw.steps.slice(0, budget.maxHops).map((step) => ({
    ...step,
    candidates: step.candidates.filter((key) => allowedMemberKeys.has(key)),
    scores: Object.fromEntries(Object.entries(step.scores).filter(([key]) => allowedMemberKeys.has(key))),
  }));

  return {
    ...raw,
    steps,
    edges,
    totalHops: steps.length,
    durationMs: Date.now() - started,
    budget,
    exhaustedBy: [...new Set(exhaustedBy)],
    estimatedTokens,
    memberCount,
  };
}
