import type { EvidenceItem } from '../trace-dynamic-context.types.js';

export interface QdrantJoinBackHit {
  packetKey: string;
  sourceRevision?: string;
  symbolVersionId?: string;
  score: number;
  collection: string;
  canonicalJoin?: boolean;
}

export function qdrantHitToEvidence(hit: QdrantJoinBackHit): EvidenceItem {
  return {
    kind: 'qdrant_hit',
    lane: 'semantic',
    status: hit.canonicalJoin === false ? 'NOT_PROVEN' : 'PARTIAL_PROVEN',
    source: hit.collection,
    symbol: hit.symbolVersionId,
    message: hit.packetKey,
    revision: hit.sourceRevision,
    score: hit.score,
  };
}

export function canonicalQdrantCollection(representationId: string): string {
  return `codebase_chunks_${representationId}`;
}
