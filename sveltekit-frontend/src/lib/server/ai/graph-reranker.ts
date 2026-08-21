/**
 * Graph Fetch-Rerank — multi-signal scoring for Qdrant candidates.
 *
 * Combines: one semantic score slot (Qdrant candidate score, optionally refined
 * by MLA inside the same logical semantic lane), PageRank, n-ary hyperedge
 * evidence, SOM adjacency, fast-AST score, and an optional signed S^3
 * feature-direction similarity.
 *
 * Canonical retrieval uses semantic_768. Derived projections and executors do
 * not create independent semantic votes.
 */

import type { RecommendationLane } from './resource-aware-recommendation-policy.js';

export interface QdrantHit {
  chunkId: string;
  score: number;
  payload?: {
    som_bmu_row?: number;
    som_bmu_col?: number;
    manifold4?: number[];
    manifold4_q?: number[];
    fast_ast_score?: number;
    tags?: string[];
    path?: string;
    pagerank?: number;
    hyperedgeWeight?: number;
    mla_score?: number;
  };
}

export interface HmmContext {
  intent?: string;
  state?: string;
  confidence?: number;
  signals?: string[];
}

export interface QuerySom {
  row?: number;
  col?: number;
  manifold4_q?: number[];
}

export interface RerankScores {
  /** Historical field name. This is the one logical semantic score slot. */
  qdrant: number;
  pagerank: number;
  hyperedge: number;
  somAdjacency: number;
  fastAst: number;
  quaternion: number;
  final: number;
}

export interface RerankResult {
  chunkId: string;
  score: number;
  scores: RerankScores;
  why: string[];
}

export interface RerankOptions {
  /** If omitted, all historical signals that are present remain eligible. */
  activeLanes?: Iterable<RecommendationLane>;
  /** Replaces the candidate semantic score inside the SAME logical lane. */
  semanticScoreByChunk?: ReadonlyMap<string, number>;
}

export const DEFAULT_RERANK_WEIGHTS = Object.freeze({
  qdrant: 0.40,
  pagerank: 0.18,
  hyperedge: 0.14,
  somAdjacency: 0.10,
  fastAst: 0.08,
  quaternion: 0.10,
});

function normalize01(value: number | null | undefined, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, Number(value)));
}

export function somAdjacencyBonus(
  queryRow?: number,
  queryCol?: number,
  docRow?: number,
  docCol?: number,
): number {
  if (![queryRow, queryCol, docRow, docCol].every(Number.isFinite)) return 0;
  const dr = Math.abs(Number(queryRow) - Number(docRow));
  const dc = Math.abs(Number(queryCol) - Number(docCol));
  const dist = Math.sqrt(dr * dr + dc * dc);
  return Math.max(0, 1 - dist / 4);
}

/**
 * Historical name retained for compatibility. These are feature directions,
 * not physical rotations, so antipodes are opposite rather than equivalent.
 */
export function quaternionSimilarity(a: number[], b: number[]): number {
  if (a.length !== 4 || b.length !== 4) return 0;
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  return normalize01((Math.max(-1, Math.min(1, dot)) + 1) / 2);
}

export function toUnitQuaternion(v: number[]): [number, number, number, number] | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const nums = v.map(Number);
  if (!nums.every(Number.isFinite)) return null;
  const norm = Math.sqrt(nums.reduce((s, x) => s + x * x, 0));
  if (norm < 1e-9) return null;
  return nums.map((x) => x / norm) as [number, number, number, number];
}

/** Legacy fixed-weight baseline retained for reproducible ablations. */
export function scoreCandidate(args: {
  qdrantScore: number;
  pagerankScore?: number;
  hyperedgeWeight?: number;
  somBonus?: number;
  fastAstScore?: number;
  quaternionScore?: number;
}): RerankScores {
  const qdrant = normalize01(args.qdrantScore);
  const pagerank = normalize01(args.pagerankScore);
  const hyperedge = normalize01(args.hyperedgeWeight);
  const somAdjacency = normalize01(args.somBonus);
  const fastAst = normalize01(args.fastAstScore);
  const quaternion = normalize01(args.quaternionScore);

  const final = Math.min(
    1,
    qdrant * DEFAULT_RERANK_WEIGHTS.qdrant +
      pagerank * DEFAULT_RERANK_WEIGHTS.pagerank +
      hyperedge * DEFAULT_RERANK_WEIGHTS.hyperedge +
      somAdjacency * DEFAULT_RERANK_WEIGHTS.somAdjacency +
      fastAst * DEFAULT_RERANK_WEIGHTS.fastAst +
      quaternion * DEFAULT_RERANK_WEIGHTS.quaternion,
  );

  return { qdrant, pagerank, hyperedge, somAdjacency, fastAst, quaternion, final };
}

/**
 * Missing optional enrichment must not count as negative evidence. Priors are
 * renormalized over signals that are actually present for this candidate.
 */
export function scoreCandidateResourceAware(args: {
  qdrantScore: number;
  pagerankScore?: number | null;
  hyperedgeWeight?: number | null;
  somBonus?: number | null;
  fastAstScore?: number | null;
  quaternionScore?: number | null;
}): RerankScores {
  const values = {
    qdrant: normalize01(args.qdrantScore),
    pagerank: normalize01(args.pagerankScore),
    hyperedge: normalize01(args.hyperedgeWeight),
    somAdjacency: normalize01(args.somBonus),
    fastAst: normalize01(args.fastAstScore),
    quaternion: normalize01(args.quaternionScore),
  };

  const present = {
    qdrant: true,
    pagerank: Number.isFinite(args.pagerankScore),
    hyperedge: Number.isFinite(args.hyperedgeWeight),
    somAdjacency: Number.isFinite(args.somBonus),
    fastAst: Number.isFinite(args.fastAstScore),
    quaternion: Number.isFinite(args.quaternionScore),
  };

  const keys = Object.keys(DEFAULT_RERANK_WEIGHTS) as Array<keyof typeof DEFAULT_RERANK_WEIGHTS>;
  const activeWeight = keys.reduce(
    (sum, key) => sum + (present[key] ? DEFAULT_RERANK_WEIGHTS[key] : 0),
    0,
  );
  const weighted = keys.reduce(
    (sum, key) => sum + (present[key] ? values[key] * DEFAULT_RERANK_WEIGHTS[key] : 0),
    0,
  );
  const final = activeWeight > 0 ? normalize01(weighted / activeWeight) : values.qdrant;
  return { ...values, final };
}

export function buildWhyLabels(scores: RerankScores): string[] {
  const why: string[] = [];
  if (scores.qdrant > 0.6) why.push('semantic_hit');
  if (scores.pagerank > 0.3) why.push('pagerank_boost');
  if (scores.hyperedge > 0.3) why.push('hyperedge_weight');
  if (scores.somAdjacency > 0.4) why.push('som_neighbor');
  if (scores.fastAst > 0.3) why.push('fast_ast_boost');
  if (scores.quaternion > 0.5) why.push('quaternion_align');
  return why;
}

export function rerankHits(
  hits: QdrantHit[],
  querySom?: QuerySom,
  limit = 20,
  options: RerankOptions = {},
): RerankResult[] {
  const activeLanes = options.activeLanes ? new Set(options.activeLanes) : null;
  const enabled = (lane: RecommendationLane) => activeLanes === null || activeLanes.has(lane);
  const queryQuat = enabled('hypersphere') && querySom?.manifold4_q
    ? toUnitQuaternion(querySom.manifold4_q)
    : null;

  const scored: RerankResult[] = hits.map((hit) => {
    const p = hit.payload ?? {};
    const hasSom = enabled('som') &&
      [querySom?.row, querySom?.col, p.som_bmu_row, p.som_bmu_col].every(Number.isFinite);
    const somBonus = hasSom
      ? somAdjacencyBonus(querySom?.row, querySom?.col, p.som_bmu_row, p.som_bmu_col)
      : undefined;

    const docQuat = enabled('hypersphere')
      ? p.manifold4_q
        ? toUnitQuaternion(p.manifold4_q)
        : p.manifold4
          ? toUnitQuaternion(p.manifold4)
          : null
      : null;
    const directionalScore = queryQuat && docQuat ? quaternionSimilarity(queryQuat, docQuat) : undefined;
    const semanticScore = options.semanticScoreByChunk?.get(hit.chunkId) ?? hit.score;

    const scores = scoreCandidateResourceAware({
      qdrantScore: semanticScore,
      pagerankScore: enabled('pagerank') ? p.pagerank : undefined,
      hyperedgeWeight: enabled('hypergraph') ? p.hyperedgeWeight : undefined,
      somBonus,
      fastAstScore: enabled('ast') ? p.fast_ast_score : undefined,
      quaternionScore: directionalScore,
    });

    return { chunkId: hit.chunkId, score: scores.final, scores, why: buildWhyLabels(scores) };
  });

  scored.sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId));
  return scored.slice(0, limit);
}
