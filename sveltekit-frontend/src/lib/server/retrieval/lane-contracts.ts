/**
 * Retrieval Lane Contracts
 *
 * Core interfaces for the DI-capable SearchRuntime.
 * Implementations live in adapters/; only interfaces and the
 * validateCandidate guard live here.
 */

export interface LaneCandidate {
  packetKey: string;       // required — RRF dedup key
  packetId?: string;       // Postgres UUID
  qdrantPointId?: string;  // Qdrant point ID

  sourceRef: string;       // required — identity anchor
  rank: number;            // 1-based position within lane
  score: number | null;    // null = unscored (disabled lane)

  lane: 'dense' | 'sparse' | 'exact' | 'ast' | 'bm25' | 'rg';
  metadata?: Record<string, unknown>;
}

export interface RetrievalInput {
  query: string;
  limit: number;
  filters?: Record<string, unknown>;
}

export interface RerankInput {
  query: string;
  candidates: LaneCandidate[];
}

export interface RerankResult {
  ranked: LaneCandidate[];
  modelVersion: string;
  fallbackReason?: string;
}

export interface Retriever {
  retrieve(input: RetrievalInput): Promise<LaneCandidate[]>;
  readonly lane: LaneCandidate['lane'];
}

export interface Reranker {
  rerank(input: RerankInput): Promise<RerankResult>;
  readonly modelVersion: string;
}

/**
 * Validate a candidate at the adapter boundary.
 * Returns the candidate if valid, null if it should be dropped before RRF.
 */
export function validateCandidate(c: LaneCandidate): LaneCandidate | null {
  if (!c.packetKey || !c.packetKey.trim()) return null;
  if (!c.sourceRef || !c.sourceRef.trim()) return null;
  if (!Number.isInteger(c.rank) || c.rank < 1) return null;
  return c;
}
