import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import { embedSemantic768 } from './semantic-768.js';
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
  sourceRef: string | null;
  /** Legacy/optional only; live atlas_packets has no canonical source_revision owner. */
  sourceRevision: string | null;
  sourceVersionReceiptId: string | null;
  reconciliationReceiptId: string | null;
  workspaceRevision: number | null;
  representationRevision: number | null;
  sourceRepresentationId: string | null;
  sourceDimension: number | null;
  symbolVersionId: string | null;
  treeNodeId: string | null;
  featureLabel: string | null;
  projectionRevision: string | null;
  /** Bounded 512d vector carried only so cuVS can exact-rerank this same candidate fabric. */
  vector: number[];
}

export interface QdrantSemanticScoreReceiptV1 {
  schema: 'atlas.qdrant-semantic-score-receipt.v2';
  collection: typeof QDRANT_SEMANTIC_COLLECTION;
  vectorName: typeof QDRANT_SEMANTIC_VECTOR_NAME;
  representationId: typeof ATLAS_CANONICAL_SEMANTIC_REPRESENTATION;
  representationRevision: string;
  dimension: typeof ATLAS_CANONICAL_SEMANTIC_DIMENSION;
  requestedPacketKeys: number;
  returnedPacketKeys: number;
  embeddingModel: string;
  embeddingCached: boolean;
  embeddingExecMs: number;
  queryVector: number[];
  scores: QdrantSemanticScoreV1[];
}

function nullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

function nullableInt(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

/**
 * Score an already-identified bounded candidate set. Qdrant remains a
 * rebuildable semantic projection; packet_key is the canonical join key.
 * Reconciled payload lineage is surfaced when available so cuVS/KMeans/DAG
 * receipts can preserve it without treating payload metadata as source truth.
 */
export async function scoreQdrantSemanticCandidatesV1(
  query: string,
  packetKeys: string[],
  limit = 512,
): Promise<QdrantSemanticScoreReceiptV1> {
  const uniquePacketKeys = [...new Set(packetKeys.filter(Boolean))].slice(0, Math.max(1, Math.min(512, limit)));
  if (uniquePacketKeys.length === 0) {
    return {
      schema: 'atlas.qdrant-semantic-score-receipt.v2',
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

  const embedding = await embedSemantic768(query);
  const client = getQdrantClient();
  const response = (await client.query(QDRANT_SEMANTIC_COLLECTION, {
    query: Array.from(embedding.vector),
    using: QDRANT_SEMANTIC_VECTOR_NAME,
    filter: {
      must: [{ key: 'packet_key', match: { any: uniquePacketKeys } }],
    },
    limit: uniquePacketKeys.length,
    with_payload: true,
    with_vector: true,
  } as any)) as any;

  const points = Array.isArray(response?.points) ? response.points : [];
  const scores: QdrantSemanticScoreV1[] = [];
  const projectionRevisions = new Set<string>();
  const representationRevisions = new Set<string>();
  for (const point of points) {
    const packetKey = point?.payload?.packet_key;
    if (typeof packetKey !== 'string' || !packetKey) continue;
    const rawVector = Array.isArray(point?.vector)
      ? point.vector
      : point?.vector && typeof point.vector === 'object'
        ? point.vector[QDRANT_SEMANTIC_VECTOR_NAME]
        : null;
    if (!Array.isArray(rawVector) || rawVector.length !== ATLAS_CANONICAL_SEMANTIC_DIMENSION) continue;

    const projectionRevision = nullableString(point?.payload?.projection_revision);
    const representationRevision = nullableInt(point?.payload?.representation_revision);
    if (projectionRevision) projectionRevisions.add(projectionRevision);
    if (representationRevision != null) representationRevisions.add(String(representationRevision));

    scores.push({
      packetKey,
      score: Number(point.score),
      pointId: point.id,
      sourceRef: nullableString(point?.payload?.source_ref),
      sourceRevision: nullableString(point?.payload?.source_revision),
      sourceVersionReceiptId: nullableString(point?.payload?.source_version_receipt_id),
      reconciliationReceiptId: nullableString(point?.payload?.reconciliation_receipt_id),
      workspaceRevision: nullableInt(point?.payload?.workspace_revision),
      representationRevision,
      sourceRepresentationId: nullableString(point?.payload?.source_representation_id),
      sourceDimension: nullableInt(point?.payload?.source_dimension),
      symbolVersionId: nullableString(point?.payload?.symbol_version_id),
      treeNodeId: nullableString(point?.payload?.tree_node_id),
      featureLabel: nullableString(point?.payload?.feature_label),
      projectionRevision,
      vector: rawVector.map(Number),
    });
  }

  const semanticRevision = projectionRevisions.size === 1
    ? [...projectionRevisions][0]
    : representationRevisions.size === 1
      ? `representation-revision:${[...representationRevisions][0]}`
      : projectionRevisions.size === 0 && representationRevisions.size === 0
        ? 'unversioned-qdrant-projection'
        : 'mixed-projection-revisions';

  return {
    schema: 'atlas.qdrant-semantic-score-receipt.v2',
    collection: QDRANT_SEMANTIC_COLLECTION,
    vectorName: QDRANT_SEMANTIC_VECTOR_NAME,
    representationId: ATLAS_CANONICAL_SEMANTIC_REPRESENTATION,
    representationRevision: semanticRevision,
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
