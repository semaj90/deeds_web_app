/**
 * packet-dense-rerank.ts — Stage 2 of atlas.packet_dense_search
 * (openspec/changes/parent-atlas-packet-dense-bitmap-search/).
 *
 * Runs a Qdrant ANN query restricted (via a payload `must` filter) to the source_ref candidate
 * set produced by Stage 1 (packet-bitmap-prefilter.ts). This is deliberately NOT an unfiltered
 * top-K sweep — the whole point of the two-stage design is that Postgres' existing bitmap
 * indexes narrow the field first, cheaply, before any vector math runs.
 *
 * Filters by `source_ref`, not `packet_key`. **Corrected twice, 2026-09-16** (an earlier version
 * of this comment claimed neither collection "carries a packet_key field" at all — wrong, found
 * by checking `GET /collections/{name}` `payload_schema`, which only lists *indexed* fields, not
 * all keys actually present on points; a follow-up correction then claimed `codebase_chunks_768_v2`
 * has NO packet_key field based on a 3-point sample, which was too small — a 1000-point resample
 * found ~12.8% coverage, matching a separate 5,000-point census's 11.96% finding):
 *   - `codebase_chunks_768`: `packet_key` IS present (inconsistently duplicated as camelCase
 *     `packetKey` on some points too — a real data-quality finding, not addressed here), just not
 *     `payload_schema`-indexed.
 *   - `codebase_chunks_768_v2`: `packet_key` present on only ~12% of points (11.96%-12.80% across
 *     two independent samples) — sparse, not absent, and definitely not reliable enough to filter
 *     on for correctness.
 *   - `source_ref` is indexed and 100%-populated on both collections in every sample taken.
 * `source_ref` remains the right filter key on both grounds: it's actually indexed (packet_key
 * isn't, on either collection) AND it has complete coverage (packet_key doesn't, especially on
 * `_v2`). An earlier version of this module filtered on `packet_key` and timed out against
 * `codebase_chunks_768` (328K points) in a live proof run — the real cause is the missing index
 * forcing an unindexed linear scan, not a missing field. The Stage 3 join-back in
 * packet-dense-search.ts still uses `packet_key` (never `source_ref` alone) once Qdrant hits are
 * mapped back to Stage 1 candidates, which come from Postgres `atlas_packets` — not from Qdrant's
 * own (partial, unindexed) `packet_key` payload field.
 *
 * The caller (packet-dense-search.ts) must supply the query vector and an explicit target
 * collection — this module does not default to codebase_chunks_768 vs. _768_v2 (see
 * design.md's Open Questions: that choice is unresolved at the repo level and left explicit).
 *
 * Uses the same raw-fetch Qdrant REST pattern already used elsewhere in this codebase
 * (e.g. src/mcp/trace-mcp-server.ts's image.search_by_text tool) rather than introducing a new
 * Qdrant client wrapper.
 */

export const DENSE_RERANK_ALLOWED_COLLECTIONS = ['codebase_chunks_768', 'codebase_chunks_768_v2'] as const;
export type DenseRerankCollection = (typeof DENSE_RERANK_ALLOWED_COLLECTIONS)[number];

export class PacketDenseRerankValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PacketDenseRerankValidationError';
  }
}

export interface PacketDenseRerankRequest {
  queryVector: number[];
  collection: DenseRerankCollection;
  candidateSourceRefs: string[];
  limit?: number;
  scoreThreshold?: number;
}

export interface PacketDenseRerankHit {
  sourceRef: string;
  score: number;
  payload: Record<string, unknown>;
  identitySource: 'qdrant_payload_source_ref';
}

export interface ExactDenseCandidate {
  packetKey: string;
  vector: readonly number[];
}

/** Correctness oracle used by the ANN comparison harness; never writes or calls Qdrant. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) throw new PacketDenseRerankValidationError('EXACT_VECTOR_DIMENSION_MISMATCH');
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) throw new PacketDenseRerankValidationError('EXACT_ZERO_NORM_VECTOR');
  return dot / Math.sqrt(normA * normB);
}

export function rankExactDenseCandidates(
  queryVector: readonly number[],
  candidates: readonly ExactDenseCandidate[],
  limit = DEFAULT_LIMIT,
): Array<{ packetKey: string; score: number }> {
  if (queryVector.length !== 768) throw new PacketDenseRerankValidationError('QUERY_REPRESENTATION_MISMATCH');
  return candidates
    .map((candidate) => ({ packetKey: candidate.packetKey, score: cosineSimilarity(queryVector, candidate.vector) }))
    .sort((a, b) => b.score - a.score || a.packetKey.localeCompare(b.packetKey))
    .slice(0, limit);
}

export interface QdrantPointsQueryFn {
  (
    collection: string,
    body: Record<string, unknown>
  ): Promise<{ result?: { points?: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }> } }>;
}

const DEFAULT_LIMIT = 10;

function assertValidRequest(req: PacketDenseRerankRequest): void {
  if (!DENSE_RERANK_ALLOWED_COLLECTIONS.includes(req.collection)) {
    throw new PacketDenseRerankValidationError(
      `atlas.packet_dense_search requires an explicit target collection, one of: ${DENSE_RERANK_ALLOWED_COLLECTIONS.join(', ')}.`
    );
  }
  if (!req.queryVector || req.queryVector.length !== 768) {
    throw new PacketDenseRerankValidationError('QUERY_REPRESENTATION_MISMATCH: queryVector must be a 768-dimensional semantic_768 embedding.');
  }
}

/**
 * Runs the filtered Qdrant ANN query. Returns [] without calling Qdrant when
 * candidateSourceRefs is empty — Stage 1 found nothing, so there is nothing to rerank
 * (spec: "Handle the case where the candidate set is empty").
 */
export async function runPacketDenseRerank(
  queryPoints: QdrantPointsQueryFn,
  req: PacketDenseRerankRequest
): Promise<PacketDenseRerankHit[]> {
  assertValidRequest(req);

  if (req.candidateSourceRefs.length === 0) {
    return [];
  }

  const filter = {
    must: [{ key: 'source_ref', match: { any: req.candidateSourceRefs } }],
  };

  const body = {
    query: req.queryVector,
    using: 'content',
    limit: req.limit ?? DEFAULT_LIMIT,
    ...(req.scoreThreshold !== undefined ? { score_threshold: req.scoreThreshold } : {}),
    with_payload: true,
    filter,
  };

  const response = await queryPoints(req.collection, body);
  const points = response.result?.points ?? [];
  const candidateSet = new Set(req.candidateSourceRefs);

  return points
    .map((pt) => {
      const sourceRef = typeof pt.payload?.source_ref === 'string' ? pt.payload.source_ref : null;
      if (!sourceRef) return null;
      return { sourceRef, score: pt.score, payload: pt.payload ?? {}, identitySource: 'qdrant_payload_source_ref' as const };
    })
    .filter((hit): hit is PacketDenseRerankHit => hit !== null)
    .filter((hit) => candidateSet.has(hit.sourceRef));
}
