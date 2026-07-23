/**
 * Rerank request contract for the Atlas retrieval pipeline.
 * All reranker implementations must accept this shape.
 */

export interface RerankCandidate {
  packetKey: string;
  sourceRef: string;
  content?: string;
  summary?: string;
  score: number;
  lane: string;
}

export interface RerankRequest {
  query: string;
  candidates: RerankCandidate[];
  topK?: number;
  modelHint?: string;
  spanContext?: { traceId: string };
}
