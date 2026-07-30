/**
 * Graph Fetch-Rerank — multi-signal scoring for Qdrant candidates.
 *
 * Combines: Qdrant semantic score (768-dim canonical or 512-dim MRL candidate),
 * Neo4j PageRank, Redis hyperedge weight, SOM adjacency bonus, fast-AST score,
 * and (optionally) manifold4_q quaternion dot-similarity.
 *
 * This is the bridge layer between RAG (Qdrant hits) and KAG (graph signals).
 * Canonical retrieval uses 768-dim vectors; 512-dim MRL candidate is under Phase 5 evaluation.
 * SOM/quaternion/manifold4 are DERIVED_PROJECTION layers, not canonical storage.
 */

/**
 * Qdrant hit with enriched payload.
 *
 * The `score` field is the ANN score from Qdrant, which is dimension-agnostic:
 * - If hit came from 768-dim primary lane: score is cosine similarity [0, 1]
 * - If hit came from 512-dim MRL candidate: score is cosine similarity [0, 1]
 * - Both are normalized; reranking treats them identically.
 *
 * Payload fields:
 * - som_bmu_row, som_bmu_col: SOM topology projection (DERIVED)
 * - manifold4, manifold4_q: Quaternion alignment (DERIVED)
 * - fast_ast_score: Structural code signal (Canonical)
 * - tags, path: Metadata (Canonical)
 * - pagerank: Neo4j authority (Canonical, cached)
 * - hyperedgeWeight: Cross-lane relationship (Canonical, Redis)
 */
export interface QdrantHit {
  chunkId:  string;
  score:    number;
  payload?: {
    som_bmu_row?:    number;
    som_bmu_col?:    number;
    manifold4?:      number[];
    manifold4_q?:    number[];
    fast_ast_score?: number;
    tags?:           string[];
    path?:           string;
    pagerank?:       number;
    hyperedgeWeight?: number;
  };
}

export interface HmmContext {
  intent?:     string;
  state?:      string;
  confidence?: number;
  signals?:    string[];
}

export interface QuerySom {
  row?: number;
  col?: number;
  manifold4_q?: number[];
}

export interface RerankScores {
  qdrant:       number;
  pagerank:     number;
  hyperedge:    number;
  somAdjacency: number;
  fastAst:      number;
  quaternion:   number;
  final:        number;
}

export interface RerankResult {
  chunkId: string;
  score:   number;
  scores:  RerankScores;
  why:     string[];
}

function normalize01(value: number | null | undefined, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, Number(value)));
}

/**
 * Bonus decays with Chebyshev distance from query BMU.
 * Adjacent cells (dist=1) → 0.75, same cell (dist=0) → 1.0, far → 0.
 */
export function somAdjacencyBonus(
  queryRow?: number,
  queryCol?: number,
  docRow?:   number,
  docCol?:   number
): number {
  if (![queryRow, queryCol, docRow, docCol].every(Number.isFinite)) return 0;
  const dr   = Math.abs(Number(queryRow) - Number(docRow));
  const dc   = Math.abs(Number(queryCol) - Number(docCol));
  const dist = Math.sqrt(dr * dr + dc * dc);
  return Math.max(0, 1 - dist / 4);
}

/**
 * Dot similarity between two unit 4-vectors.
 * Both vectors must already be L2-normalised (manifold4_q field).
 */
export function quaternionSimilarity(
  a: number[],
  b: number[]
): number {
  if (a.length !== 4 || b.length !== 4) return 0;
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  return Math.abs(dot); // symmetric: |q·p| = |q·(-p)|
}

/**
 * Normalise a raw 4-vector to unit length (L2).
 * Returns null if the vector is invalid or zero.
 */
export function toUnitQuaternion(v: number[]): [number, number, number, number] | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const nums = v.map(Number);
  if (!nums.every(Number.isFinite)) return null;
  const norm = Math.sqrt(nums.reduce((s, x) => s + x * x, 0));
  if (norm < 1e-9) return null;
  return nums.map((x) => x / norm) as [number, number, number, number];
}

/**
 * Score candidate using multi-signal blend.
 *
 * Weight breakdown (normalized to [0, 1], sum = 1.0):
 * - qdrant (semantic): 0.40 — primary retrieval signal (768-dim or 512-dim MRL)
 * - pagerank: 0.18 — graph authority (cached from Neo4j)
 * - hyperedge: 0.14 — cross-lane relationship weight (from Redis/Valkey)
 * - somAdjacency: 0.10 — topology projection neighbor bonus (DERIVED_PROJECTION)
 * - fastAst: 0.08 — structural code signal (lexical/AST)
 * - quaternion: 0.10 — manifold4 quaternion alignment (DERIVED_PROJECTION, optional)
 *
 * This is a variant of the Karpathy blend (0.4·PR + 0.3·attn + 0.3·authority).
 * Canonical blend stored in Redis: gpu:karpathy:scores hash (24h TTL).
 */
export function scoreCandidate(args: {
  qdrantScore:      number;
  pagerankScore?:   number;
  hyperedgeWeight?: number;
  somBonus?:        number;
  fastAstScore?:    number;
  quaternionScore?: number;
}): RerankScores {
  const qdrant      = normalize01(args.qdrantScore);
  const pagerank    = normalize01(args.pagerankScore);
  const hyperedge   = normalize01(args.hyperedgeWeight);
  const somAdjacency= normalize01(args.somBonus);
  const fastAst     = normalize01(args.fastAstScore);
  const quaternion  = normalize01(args.quaternionScore);

  const final = Math.min(1,
    qdrant       * 0.40 +
    pagerank     * 0.18 +
    hyperedge    * 0.14 +
    somAdjacency * 0.10 +
    fastAst      * 0.08 +
    quaternion   * 0.10
  );

  return { qdrant, pagerank, hyperedge, somAdjacency, fastAst, quaternion, final };
}

export function buildWhyLabels(scores: RerankScores): string[] {
  const why: string[] = [];
  if (scores.qdrant      > 0.6)  why.push('semantic_hit');
  if (scores.pagerank    > 0.3)  why.push('pagerank_boost');
  if (scores.hyperedge   > 0.3)  why.push('hyperedge_weight');
  if (scores.somAdjacency > 0.4) why.push('som_neighbor');
  if (scores.fastAst     > 0.3)  why.push('fast_ast_boost');
  if (scores.quaternion  > 0.5)  why.push('quaternion_align');
  return why;
}

/**
 * Re-rank a list of Qdrant hits using graph signals.
 *
 * Qdrant hits can come from either:
 * - 768-dim canonical semantic lane (primary, native EmbeddingGemma)
 * - 512-dim MRL candidate lane (under evaluation, Phase 5 ablation pending)
 *
 * All graph enrichment (pagerank, hyperedgeWeight, SOM, quaternion) should be
 * pre-fetched and embedded in each hit's payload before calling this function.
 *
 * The final score uses scoreCandidate() which normalizes all signals [0,1]
 * regardless of source dimension.
 */
export function rerankHits(
  hits:       QdrantHit[],
  querySom?:  QuerySom,
  limit = 20
): RerankResult[] {
  const queryQuat = querySom?.manifold4_q
    ? toUnitQuaternion(querySom.manifold4_q)
    : null;

  const scored: RerankResult[] = hits.map((hit) => {
    const p = hit.payload ?? {};

    const somBonus = somAdjacencyBonus(
      querySom?.row, querySom?.col,
      p.som_bmu_row,  p.som_bmu_col
    );

    const docQuat = p.manifold4_q
      ? toUnitQuaternion(p.manifold4_q)
      : (p.manifold4 ? toUnitQuaternion(p.manifold4) : null);

    const quaternionScore = (queryQuat && docQuat)
      ? quaternionSimilarity(queryQuat, docQuat)
      : 0;

    const scores = scoreCandidate({
      qdrantScore:      hit.score,
      pagerankScore:    p.pagerank,
      hyperedgeWeight:  p.hyperedgeWeight,
      somBonus,
      fastAstScore:     p.fast_ast_score,
      quaternionScore,
    });

    return {
      chunkId: hit.chunkId,
      score:   scores.final,
      scores,
      why:     buildWhyLabels(scores),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
