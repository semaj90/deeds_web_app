import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import { embedSemantic512 } from './semantic-512.js';
import {
  ATLAS_CANONICAL_SEMANTIC_DIMENSION,
  ATLAS_CANONICAL_SEMANTIC_REPRESENTATION,
  QDRANT_SEMANTIC_COLLECTION,
  QDRANT_SEMANTIC_VECTOR_NAME,
} from './qdrant-semantic-projection.js';

export interface QdrantSemanticScoreV1 {
  packetKey: string;
  score: number;
  pointId: string | number;
  sourceRevision: string | null;
  symbolVersionId: string | null;
  treeNodeId: string | null;
  featureLabel: string | null;
  projectionRevision: string | null;
  /** Bounded 512d vector carried only so cuVS can exact-rerank this same candidate fabric. */
  vector: number[];
}

export interface QdrantSemanticScoreReceiptV1 {
  schema: 'atlas.qdrant-semantic-score-receipt.v1';
  collection: typeof QDRANT_SEMANTIC_COLLECTION;
  vectorName: null;
  representationId: typeof ATLAS_CANONICAL_SEMANTIC_REPRESENTATION;
  representationRevision: string;
  dimension: typeof ATLAS_CANONICAL_SEMANTIC_DIMENSION;
  requestedPacketKeys: number;
  returnedPacketKeys: number;
  embeddingModel: string;
  embeddingCached: boolean;
  embeddingExecMs: number;
  /** Kept server-side for the immediately-following exact cuVS rerank. */
  queryVector: number[];
  scores: QdrantSemanticScoreV1[];
}

/**
 * Score an already-identified bounded candidate set. This function never uses
 * Qdrant point IDs as canonical identity; every result must carry packet_key.
 * `codebase_chunks_512` is an unnamed-vector collection, so no `using` field is
 * sent. Query vectors are EmbeddingGemma MRL-512 prefixes with explicit L2
 * re-normalization before either Qdrant or cuVS sees them.
 */
export async function scoreQdrantSemanticCandidatesV1(
  query: string,
  packetKeys: string[],
  limit = 512,
): Promise<QdrantSemanticScoreReceiptV1> {
  const uniquePacketKeys = [...new Set(packetKeys.filter(Boolean))].slice(0, Math.max(1, Math.min(512, limit)));
  if (uniquePacketKeys.length === 0) {
    return {
      schema: 'atlas.qdrant-semantic-score-receipt.v1',
      collection: QDRANT_SEMANTIC_COLLECTION,
      vectorName: QDRANT_SEMANTIC_VECTOR_NAME,
      representationId: ATLAS_CANONICAL_SEMANTIC_REPRESENTATION,
      representationRevision: 'not-run',
      dimension: ATLAS_CANONICAL_SEMANTIC_DIMENSION,
      requestedPacketKeys: 0,
      returnedPacketKeys: 0,
      embeddingModel: 'not-run',
      embeddingCached: false,
      embeddingExecMs: 0,
      queryVector: [],
      scores: [],
    };
  }

  const embedding = await embedSemantic512(query);
  const client = getQdrantClient();
  const response = (await client.query(QDRANT_SEMANTIC_COLLECTION, {
    query: Array.from(embedding.vector),
    filter: {
      must: [
        { key: 'packet_key', match: { any: uniquePacketKeys } },
      ],
    },
    limit: uniquePacketKeys.length,
    with_payload: true,
    with_vector: true,
  } as any)) as any;

  const points = Array.isArray(response?.points) ? response.points : [];
  const scores: QdrantSemanticScoreV1[] = [];
  const projectionRevisions = new Set<string>();
  for (const point of points) {
    const packetKey = point?.payload?.packet_key;
    if (typeof packetKey !== 'string' || !packetKey) continue;
    const rawVector = Array.isArray(point?.vector)
      ? point.vector
      : point?.vector && typeof point.vector === 'object'
        ? Object.values(point.vector)[0]
        : null;
    if (!Array.isArray(rawVector) || rawVector.length !== ATLAS_CANONICAL_SEMANTIC_DIMENSION) continue;
    const projectionRevision = point?.payload?.projection_revision == null
      ? null
      : String(point.payload.projection_revision);
    if (projectionRevision) projectionRevisions.add(projectionRevision);
    scores.push({
      packetKey,
      score: Number(point.score),
      pointId: point.id,
      sourceRevision:
        point?.payload?.source_revision == null ? null : String(point.payload.source_revision),
      symbolVersionId:
        point?.payload?.symbol_version_id == null ? null : String(point.payload.symbol_version_id),
      treeNodeId:
        point?.payload?.tree_node_id == null ? null : String(point.payload.tree_node_id),
      featureLabel:
        point?.payload?.feature_label == null ? null : String(point.payload.feature_label),
      projectionRevision,
      vector: rawVector.map(Number),
    });
  }

  const representationRevision = projectionRevisions.size === 1
    ? [...projectionRevisions][0]
    : projectionRevisions.size === 0
      ? 'unversioned-qdrant-projection'
      : 'mixed-projection-revisions';

  return {
    schema: 'atlas.qdrant-semantic-score-receipt.v1',
    collection: QDRANT_SEMANTIC_COLLECTION,
    vectorName: QDRANT_SEMANTIC_VECTOR_NAME,
    representationId: ATLAS_CANONICAL_SEMANTIC_REPRESENTATION,
    representationRevision,
    dimension: ATLAS_CANONICAL_SEMANTIC_DIMENSION,
    requestedPacketKeys: uniquePacketKeys.length,
    returnedPacketKeys: scores.length,
    embeddingModel: embedding.model,
    embeddingCached: embedding.cached,
    embeddingExecMs: embedding.exec_ms,
    queryVector: Array.from(embedding.vector),
    scores,
  };
}
