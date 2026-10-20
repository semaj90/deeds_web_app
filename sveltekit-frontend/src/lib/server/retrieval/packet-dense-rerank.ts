/**
 * packet-dense-rerank.ts — Stage 2 of atlas.packet_dense_search
 * (openspec/changes/parent-atlas-packet-dense-bitmap-search/).
 *
 * Qdrant is filtered by exact chunk row IDs resolved through PostgreSQL's admitted packet/chunk
 * lineage, with packet_key as a sparse locator fallback. Neither Qdrant payload field is identity:
 * every hit must map back through PostgreSQL before it can rank a packet. source_ref-only filtering
 * remains available solely for legacy callers that do not supply canonical candidate identities.
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
  /** Legacy path: source_ref filter; canonical chunk/packet filters take precedence. */
  candidateSourceRefs: string[];
  /**
   * Preferred path: restrict Qdrant to the chunk identities (payload.postgres_id = codebase_chunk_index.id)
   * that the Stage 1 packets resolve to through atlas_packet_chunk_lineage. Identity is exact, so the
   * source_ref namespace (Qdrant stores paths relative to sveltekit-frontend/) does not gate results.
   */
  candidateChunkIds?: string[];
  candidatePacketKeys?: string[];
  limit?: number;
  scoreThreshold?: number;
}

export interface PacketDenseRerankHit {
  id: string | number;
  sourceRef: string | null;
  score: number;
  payload: Record<string, unknown>;
  identitySource: 'qdrant_payload';
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
 * all bounded candidate identity lists are empty — Stage 1 found nothing, so there is nothing to rerank
 * (spec: "Handle the case where the candidate set is empty").
 */
export async function runPacketDenseRerank(
  queryPoints: QdrantPointsQueryFn,
  req: PacketDenseRerankRequest
): Promise<PacketDenseRerankHit[]> {
  assertValidRequest(req);

  const candidateChunkIds = req.candidateChunkIds ?? [];
  const candidatePacketKeys = req.candidatePacketKeys ?? [];
  const useCanonicalIdentityFilter = candidateChunkIds.length > 0 || candidatePacketKeys.length > 0;
  if (!useCanonicalIdentityFilter && req.candidateSourceRefs.length === 0) {
    return [];
  }

  const filter = useCanonicalIdentityFilter
    ? {
        should: [
          ...(candidateChunkIds.length > 0 ? [{ key: 'postgres_id', match: { any: candidateChunkIds } }] : []),
          ...(candidatePacketKeys.length > 0 ? [{ key: 'packet_key', match: { any: candidatePacketKeys } }] : []),
        ],
      }
    : { must: [{ key: 'source_ref', match: { any: req.candidateSourceRefs } }] };

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
    .filter((point) => !Number.isNaN(point.score) && Number.isFinite(point.score))
    .filter((point) => useCanonicalIdentityFilter || candidateSet.has(String(point.payload?.source_ref ?? '')))
    .map((point) => ({
      id: point.id,
      sourceRef: typeof point.payload?.source_ref === 'string' ? point.payload.source_ref : null,
      score: point.score,
      payload: point.payload ?? {},
      identitySource: 'qdrant_payload' as const,
    }));
}
