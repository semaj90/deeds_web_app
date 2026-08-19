export type SemanticSeedExecutor = 'QDRANT' | 'CAGRA_HOT_SHARD';
export type GraphStrategy = 'WEIGHTED_BEST_FIRST' | 'BFS' | 'SSSP' | 'PERSONALIZED_PAGERANK';

export interface SemanticSeedV1 {
  canonicalOrdinal: number;
  canonicalId: string;
  packetKey?: string | null;
  sourceRef: string;
  semanticScore: number;
  latent128Score?: number | null;
  latent64Score?: number | null;
}

export interface GraphNeighborV1 {
  canonicalOrdinal: number;
  canonicalId: string;
  sourceRef: string;
  relationType: string;
  relationWeight?: number | null;
  pagerank?: number | null;
  ontologyMatch?: number | null;
  hyperedgeOrdinal?: number | null;
  evidenceRef?: string | null;
}

export interface GraphExpansionBudgetV1 {
  maxDepth: number;
  maxEdgesVisited: number;
  maxFrontier: number;
  maxHyperedges: number;
  allowedRelationTypes?: readonly string[];
}

export interface FrontierWeightsV1 {
  semantic: number;
  latent128: number;
  latent64: number;
  relation: number;
  pagerank: number;
  ontology: number;
  hopPenalty: number;
}

export interface FrontierCandidateV1 extends GraphNeighborV1 {
  seedCanonicalId: string;
  depth: number;
  priority: number;
}

export const DEFAULT_FRONTIER_WEIGHTS: FrontierWeightsV1 = Object.freeze({
  semantic: 0.40,
  latent128: 0.10,
  latent64: 0.05,
  relation: 0.20,
  pagerank: 0.10,
  ontology: 0.10,
  hopPenalty: 0.05,
});

function clamp01(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, Number(value))) : 0;
}

/**
 * Relevance-oriented weighted best-first score.
 *
 * This is intentionally NOT called A*: semantic/PageRank/ontology terms are
 * relevance heuristics, not independently proven admissible lower bounds for a
 * shortest-path cost. The function is deterministic and is suitable for ranking
 * a bounded relation frontier after a semantic seed stage.
 */
export function scoreGraphFrontierCandidate(
  seed: SemanticSeedV1,
  neighbor: GraphNeighborV1,
  depth: number,
  weights: FrontierWeightsV1 = DEFAULT_FRONTIER_WEIGHTS,
): number {
  return (
    weights.semantic * clamp01(seed.semanticScore) +
    weights.latent128 * clamp01(seed.latent128Score) +
    weights.latent64 * clamp01(seed.latent64Score) +
    weights.relation * clamp01(neighbor.relationWeight) +
    weights.pagerank * clamp01(neighbor.pagerank) +
    weights.ontology * clamp01(neighbor.ontologyMatch) -
    weights.hopPenalty * Math.max(0, depth)
  );
}

/** Deterministic tie-breaking: priority DESC, then canonical ordinal ASC. */
export function sortGraphFrontier(candidates: FrontierCandidateV1[]): FrontierCandidateV1[] {
  return [...candidates].sort((a, b) => b.priority - a.priority || a.canonicalOrdinal - b.canonicalOrdinal);
}

export function buildOneHopFrontier(input: {
  seeds: readonly SemanticSeedV1[];
  neighborsBySeed: ReadonlyMap<string, readonly GraphNeighborV1[]>;
  budget: GraphExpansionBudgetV1;
  weights?: FrontierWeightsV1;
}): FrontierCandidateV1[] {
  const allowed = input.budget.allowedRelationTypes?.length
    ? new Set(input.budget.allowedRelationTypes)
    : null;
  const dedupe = new Map<string, FrontierCandidateV1>();
  let edgesVisited = 0;
  const hyperedges = new Set<number>();

  for (const seed of [...input.seeds].sort((a, b) => a.canonicalOrdinal - b.canonicalOrdinal)) {
    const neighbors = input.neighborsBySeed.get(seed.canonicalId) ?? [];
    for (const neighbor of neighbors) {
      if (edgesVisited >= input.budget.maxEdgesVisited) break;
      edgesVisited += 1;
      if (allowed && !allowed.has(neighbor.relationType)) continue;
      if (neighbor.hyperedgeOrdinal != null) {
        hyperedges.add(neighbor.hyperedgeOrdinal);
        if (hyperedges.size > input.budget.maxHyperedges) continue;
      }
      const candidate: FrontierCandidateV1 = {
        ...neighbor,
        seedCanonicalId: seed.canonicalId,
        depth: 1,
        priority: scoreGraphFrontierCandidate(seed, neighbor, 1, input.weights),
      };
      const existing = dedupe.get(neighbor.canonicalId);
      if (!existing || candidate.priority > existing.priority ||
          (candidate.priority === existing.priority && candidate.canonicalOrdinal < existing.canonicalOrdinal)) {
        dedupe.set(neighbor.canonicalId, candidate);
      }
    }
  }

  return sortGraphFrontier([...dedupe.values()]).slice(0, input.budget.maxFrontier);
}
