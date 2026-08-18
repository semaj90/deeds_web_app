/**
 * GraphSearch-inspired traversal over the existing n-ary hyperedge store.
 * Canonical relation truth stays in Hyperedge/HyperedgeMember; traversal only
 * controls how much of that truth is expanded for one request.
 */

import type {
  HyperedgeSearchParams,
  TraversalStep,
  TraversalResult,
  SearchMode,
  Hyperedge,
} from './hypergraph-types.js';
import { searchHyperedges } from './hypergraph-search.js';

export interface HypergraphTraversalBudget {
  maxEdges: number;
  maxMembers: number;
  maxHops: number;
  maxTokens: number;
  maxMillis: number;
}

export interface BudgetedTraversalResult extends TraversalResult {
  exhaustedBy: Array<'edges' | 'members' | 'hops' | 'tokens' | 'millis'>;
  memberCount: number;
  estimatedTokens: number;
}

const estimateTokens = (value: string) => Math.max(1, Math.ceil(value.length / 4));
const edgeTokenEstimate = (edge: Hyperedge) =>
  estimateTokens(edge.label ?? edge.edge_type) +
  edge.members.reduce((total, member) => total + estimateTokens(member.member_key), 0);

async function hop(
  anchorKey: string,
  hopNum: number,
  limit: number,
): Promise<{ step: TraversalStep; edges: Hyperedge[] }> {
  const { results } = await searchHyperedges({ member_key: anchorKey, limit });
  const decay = 1 / hopNum;
  const scores: Record<string, number> = {};

  for (const result of results) {
    for (const member of result.edge.members) {
      if (member.member_key === anchorKey) continue;
      const score = result.activationScore * decay;
      scores[member.member_key] = Math.max(scores[member.member_key] ?? 0, score);
    }
  }

  return {
    step: { hop: hopNum, anchor_key: anchorKey, candidates: Object.keys(scores), scores },
    edges: results.map((result) => result.edge),
  };
}

export async function traverseHop1(anchorKey: string, limit = 30): Promise<TraversalResult> {
  const started = Date.now();
  const { step, edges } = await hop(anchorKey, 1, limit);
  return {
    mode: 'hop1',
    anchor_key: anchorKey,
    steps: [step],
    edges,
    totalHops: 1,
    durationMs: Date.now() - started,
  };
}

export async function traverseMultihop(
  anchorKey: string,
  maxHops = 2,
  limitPerHop = 20,
): Promise<TraversalResult> {
  const result = await traverseMultihopBounded(anchorKey, {
    maxEdges: Number.MAX_SAFE_INTEGER,
    maxMembers: Number.MAX_SAFE_INTEGER,
    maxHops,
    maxTokens: Number.MAX_SAFE_INTEGER,
    maxMillis: Number.MAX_SAFE_INTEGER,
  }, limitPerHop);
  const { exhaustedBy: _exhaustedBy, memberCount: _memberCount, estimatedTokens: _estimatedTokens, ...legacy } = result;
  return legacy;
}

/**
 * Resource-aware multihop traversal. Bounds are checked during expansion, before
 * the next frontier is queried, so maxEdges/maxMembers/maxTokens/maxMillis limit
 * actual store/query work rather than merely truncating the returned result.
 */
export async function traverseMultihopBounded(
  anchorKey: string,
  budget: HypergraphTraversalBudget,
  limitPerHop = 20,
): Promise<BudgetedTraversalResult> {
  const started = Date.now();
  const visited = new Set<string>([anchorKey]);
  const steps: TraversalStep[] = [];
  const allEdges = new Map<string, Hyperedge>();
  const exhaustedBy: BudgetedTraversalResult['exhaustedBy'] = [];
  let frontier = [anchorKey];
  let memberCount = 0;
  let estimatedTokens = 0;

  const maxHops = Math.max(0, budget.maxHops);
  outer: for (let h = 1; h <= maxHops && frontier.length > 0; h++) {
    const mergedScores: Record<string, number> = {};
    const newCandidates = new Set<string>();

    for (const anchor of frontier) {
      if (Date.now() - started >= budget.maxMillis) {
        exhaustedBy.push('millis');
        break outer;
      }
      if (allEdges.size >= budget.maxEdges) {
        exhaustedBy.push('edges');
        break outer;
      }
      if (memberCount >= budget.maxMembers) {
        exhaustedBy.push('members');
        break outer;
      }
      if (estimatedTokens >= budget.maxTokens) {
        exhaustedBy.push('tokens');
        break outer;
      }

      // Never ask the backing store for more edges than the remaining edge budget.
      const remainingEdges = Math.max(0, budget.maxEdges - allEdges.size);
      const requestLimit = Math.min(limitPerHop, remainingEdges);
      if (requestLimit <= 0) {
        exhaustedBy.push('edges');
        break outer;
      }

      const { step, edges } = await hop(anchor, h, requestLimit);
      for (const edge of edges) {
        if (allEdges.has(edge.id)) continue;
        const nextMembers = memberCount + edge.members.length;
        const nextTokens = estimatedTokens + edgeTokenEstimate(edge);
        if (allEdges.size + 1 > budget.maxEdges) { exhaustedBy.push('edges'); break outer; }
        if (nextMembers > budget.maxMembers) { exhaustedBy.push('members'); break outer; }
        if (nextTokens > budget.maxTokens) { exhaustedBy.push('tokens'); break outer; }
        allEdges.set(edge.id, edge);
        memberCount = nextMembers;
        estimatedTokens = nextTokens;
      }

      for (const [key, score] of Object.entries(step.scores)) {
        if (visited.has(key)) continue;
        mergedScores[key] = Math.max(mergedScores[key] ?? 0, score);
        newCandidates.add(key);
      }
    }

    const newKeys = [...newCandidates].sort();
    steps.push({ hop: h, anchor_key: anchorKey, candidates: newKeys, scores: mergedScores });
    newKeys.forEach((key) => visited.add(key));
    frontier = newKeys;
  }

  if (steps.length >= maxHops && maxHops > 0) exhaustedBy.push('hops');

  return {
    mode: 'multihop',
    anchor_key: anchorKey,
    steps,
    edges: [...allEdges.values()],
    totalHops: steps.length,
    durationMs: Date.now() - started,
    exhaustedBy: [...new Set(exhaustedBy)],
    memberCount,
    estimatedTokens,
  };
}

export async function traverseFlat(
  params: Omit<HyperedgeSearchParams, 'search_mode' | 'anchor_key' | 'max_hops'>,
): Promise<TraversalResult> {
  const started = Date.now();
  const { results } = await searchHyperedges(params);
  const candidateScores: Record<string, number> = {};
  for (const result of results) {
    for (const key of result.matchedMembers) {
      candidateScores[key] = Math.max(candidateScores[key] ?? 0, result.activationScore);
    }
  }
  return {
    mode: 'global',
    anchor_key: '',
    steps: [{ hop: 0, anchor_key: '', candidates: Object.keys(candidateScores), scores: candidateScores }],
    edges: results.map((result) => result.edge),
    totalHops: 0,
    durationMs: Date.now() - started,
  };
}

export async function traverseHypergraph(params: HyperedgeSearchParams): Promise<TraversalResult> {
  const mode: SearchMode = params.search_mode ?? 'global';
  const anchor = params.anchor_key ?? '';
  const maxHops = params.max_hops ?? 2;
  const limit = params.limit ?? 20;

  switch (mode) {
    case 'hop1': return traverseHop1(anchor, limit);
    case 'multihop': return traverseMultihop(anchor, maxHops, Math.max(1, Math.ceil(limit / Math.max(1, maxHops))));
    default: return traverseFlat(params);
  }
}
