/**
 * hypergraph-traversal.ts
 *
 * GraphSearch-inspired traversal over the hyperedge graph.
 *
 * GraphSearch-R  (recursive, message-passing style):
 *   traverseHop1     — single structural expansion from anchor_key
 *   traverseMultihop — iterative hop-by-hop expansion up to max_hops
 *
 * GraphSearch-F  (flat, no hop constraint):
 *   traverseFlat     — full corpus retrieval via searchHyperedges
 *
 * traverseHypergraph — unified dispatcher routed by HyperedgeSearchParams.search_mode
 *
 * Hybrid scoring: anchor_similarity proxied by hop-decay on activationScore.
 * anchor_similarity(hop h) = activationScore × (1/h)
 * query_similarity uses existing scoreBreakdown from searchHyperedges.
 */

import type {
  HyperedgeSearchParams,
  TraversalStep,
  TraversalResult,
  SearchMode,
  Hyperedge,
} from './hypergraph-types.js';
import { searchHyperedges } from './hypergraph-search.js';

// ── Internal hop primitive ────────────────────────────────────────────────────
// Returns the edges found at a single hop from anchor and the candidate set.

async function hop(
  anchorKey: string,
  hopNum: number,
  limit: number,
): Promise<{ step: TraversalStep; edges: Hyperedge[] }> {
  const { results } = await searchHyperedges({ member_key: anchorKey, limit });
  // anchor_similarity decays with hop distance (GraphSearch-R structural prior)
  const decay = 1 / hopNum;
  const scores: Record<string, number> = {};

  for (const r of results) {
    for (const m of r.edge.members) {
      if (m.member_key === anchorKey) continue;
      const s = r.activationScore * decay;
      scores[m.member_key] = Math.max(scores[m.member_key] ?? 0, s);
    }
  }

  return {
    step: { hop: hopNum, anchor_key: anchorKey, candidates: Object.keys(scores), scores },
    edges: results.map(r => r.edge),
  };
}

// ── GraphSearch-R: hop1 ───────────────────────────────────────────────────────
// Single structural expansion: find all edges containing anchor_key as a member,
// collect their other members as candidates (immediate structural neighbors).

export async function traverseHop1(anchorKey: string, limit = 30): Promise<TraversalResult> {
  const t0 = Date.now();
  const { step, edges } = await hop(anchorKey, 1, limit);
  return {
    mode: 'hop1',
    anchor_key: anchorKey,
    steps: [step],
    edges,
    totalHops: 1,
    durationMs: Date.now() - t0,
  };
}

// ── GraphSearch-R: multihop ───────────────────────────────────────────────────
// Recursive expansion: each hop's candidate set becomes the next hop's frontier.
// Stops when frontier is empty or max_hops is reached.
// Visited set prevents re-traversal, matching GNN message-passing semantics.

export async function traverseMultihop(
  anchorKey: string,
  maxHops = 2,
  limitPerHop = 20,
): Promise<TraversalResult> {
  const t0 = Date.now();
  const visited = new Set<string>([anchorKey]);
  const steps: TraversalStep[] = [];
  const allEdges = new Map<string, Hyperedge>();
  let frontier = [anchorKey];

  for (let h = 1; h <= maxHops && frontier.length > 0; h++) {
    const mergedScores: Record<string, number> = {};
    const newCandidates = new Set<string>();

    for (const anchor of frontier) {
      const { step, edges } = await hop(anchor, h, limitPerHop);
      for (const e of edges) allEdges.set(e.id, e);
      for (const [k, s] of Object.entries(step.scores)) {
        if (visited.has(k)) continue;
        mergedScores[k] = Math.max(mergedScores[k] ?? 0, s);
        newCandidates.add(k);
      }
    }

    const newKeys = [...newCandidates];
    steps.push({ hop: h, anchor_key: anchorKey, candidates: newKeys, scores: mergedScores });
    newKeys.forEach(k => visited.add(k));
    frontier = newKeys;
  }

  return {
    mode: 'multihop',
    anchor_key: anchorKey,
    steps,
    edges: [...allEdges.values()],
    totalHops: steps.length,
    durationMs: Date.now() - t0,
  };
}

// ── GraphSearch-F: flat global ────────────────────────────────────────────────
// No hop constraint — retrieves from the full corpus using structured params.
// Equivalent to the original searchHyperedges, wrapped as a TraversalResult.

export async function traverseFlat(
  params: Omit<HyperedgeSearchParams, 'search_mode' | 'anchor_key' | 'max_hops'>,
): Promise<TraversalResult> {
  const t0 = Date.now();
  const { results } = await searchHyperedges(params);
  // Collect matched members as candidates with their activation scores
  const candidateScores: Record<string, number> = {};
  for (const r of results) {
    for (const key of r.matchedMembers) {
      candidateScores[key] = Math.max(candidateScores[key] ?? 0, r.activationScore);
    }
  }
  return {
    mode: 'global',
    anchor_key: '',
    steps: [{
      hop: 0,
      anchor_key: '',
      candidates: Object.keys(candidateScores),
      scores: candidateScores,
    }],
    edges: results.map(r => r.edge),
    totalHops: 0,
    durationMs: Date.now() - t0,
  };
}

// ── Unified dispatcher ────────────────────────────────────────────────────────
// Routes to the right traversal mode based on params.search_mode.
// Default is 'global' (GraphSearch-F) when no mode is specified.

export async function traverseHypergraph(params: HyperedgeSearchParams): Promise<TraversalResult> {
  const mode: SearchMode = params.search_mode ?? 'global';
  const anchor = params.anchor_key ?? '';
  const maxHops = params.max_hops ?? 2;
  const limit = params.limit ?? 20;

  switch (mode) {
    case 'hop1':
      return traverseHop1(anchor, limit);
    case 'multihop':
      return traverseMultihop(anchor, maxHops, Math.ceil(limit / maxHops));
    default:
      return traverseFlat(params);
  }
}
