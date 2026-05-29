export type AtlasRoutingMatrix = {
  queryLanes: string[];
  memoryLanes: string[];
  weights: Record<string, Record<string, number>>; // queryLane -> memoryLane -> weight
  tokenBudget: Record<string, number>;
};

export type SchemaMask = {
  hasSourceRef: boolean;
  hasGraphNode: boolean;
  hasReward: boolean;
  isStale: boolean;
  isGenerated: boolean;
  isArchiveNoise: boolean;
};

export function buildAtlasRoutingMatrix(query: string, opts?: { userId?: string | number; tokenBudget?: Record<string, number> }): AtlasRoutingMatrix {
  const queryLanes = ['lexical', 'semantic', 'graph', 'behavioral'];
  const memoryLanes = ['redis', 'qdrant', 'neo4j', 'postgres', 'duckdb', 'engram'];
  // default weights: favor semantic + graph for semantic lanes, lexical for redis/postgres
  const weights: AtlasRoutingMatrix['weights'] = {
    lexical: { redis: 0.6, qdrant: 0.1, neo4j: 0.05, postgres: 0.2, duckdb: 0.02, engram: 0.03 },
    semantic: { redis: 0.25, qdrant: 0.5, neo4j: 0.05, postgres: 0.05, duckdb: 0.05, engram: 0.1 },
    graph: { redis: 0.05, qdrant: 0.15, neo4j: 0.6, postgres: 0.05, duckdb: 0.05, engram: 0.1 },
    behavioral: { redis: 0.1, qdrant: 0.1, neo4j: 0.1, postgres: 0.2, duckdb: 0.1, engram: 0.4 },
  };

  const defaultBudget = { lexical: 200, semantic: 1500, graph: 500, behavioral: 300 };
  const tokenBudget = { ...defaultBudget, ...(opts?.tokenBudget ?? {}) };

  return { queryLanes, memoryLanes, weights, tokenBudget };
}

// matrix version for observability
export const MATRIX_VERSION = '0.1.0';

export function formatRoutingSummary(matrix: AtlasRoutingMatrix) {
  return {
    version: MATRIX_VERSION,
    queryLanes: matrix.queryLanes,
    memoryLanes: matrix.memoryLanes,
    weights: matrix.weights,
    tokenBudget: matrix.tokenBudget,
  };
}

// Simple scoring layer: aggregate features into a score [0..1]
export function scoreAceCandidate(candidate: any, matrix: AtlasRoutingMatrix, schemaMask: SchemaMask) {
  // base score from candidate.finalScore or candidate.score
  const base = Number(candidate.finalScore ?? candidate.score ?? 0) || 0;

  // schema mask multiplier
  const maskBoost =
    (schemaMask.hasSourceRef ? 0.25 : 0) + (schemaMask.hasGraphNode ? 0.2 : 0) + (schemaMask.hasReward ? 0.2 : 0);

  // freshness penalty
  const freshness = typeof candidate.freshness === 'number' ? Math.max(0, 1 - candidate.freshness) : 1;

  // archive noise / generated downranks
  const archivePenalty = schemaMask.isArchiveNoise ? 0.5 : 1;
  const generatedPenalty = schemaMask.isGenerated ? 0.8 : 1;

  // karpathy/authority score if present
  const karpathy = Number(candidate.karpathyScore ?? candidate.authority?.score ?? 0) || 0;

  // reward score if present
  const reward = Number(candidate.rewardScore ?? 0) || 0;

  // composite
  const score = Math.min(1, (base * 0.5 + karpathy * 0.2 + reward * 0.15 + maskBoost * 0.15) * freshness * archivePenalty * generatedPenalty);

  const breakdown = { base, karpathy, reward, maskBoost, freshness, archivePenalty, generatedPenalty };
  return { score, breakdown };
}
