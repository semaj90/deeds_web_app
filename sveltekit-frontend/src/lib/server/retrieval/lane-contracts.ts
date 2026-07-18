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

  lane: 'dense' | 'sparse' | 'bm42' | 'exact' | 'ast' | 'bm25' | 'rg' | 'go-retrieval';
  metadata?: Record<string, unknown>;

  /**
   * Where fusion was applied. Adapters emit 'lane' (single-lane raw scores).
   * SearchRuntime promotes to 'search_runtime' after RRF across all lanes.
   * Allows downstream consumers to detect accidental double-fusion.
   */
  fusionStage?: 'lane' | 'search_runtime';
}

/**
 * A LaneCandidate that has been through RRF in SearchRuntime.
 * Carries the fused score alongside the original lane score and is
 * narrowed so fusionStage is always 'search_runtime'.
 */
export interface FusedLaneCandidate extends LaneCandidate {
  fusionStage: 'search_runtime';
  fusedScore: number;
  /** Sum of reciprocal ranks from all lanes (RRF numerics). */
  rrfScore: number;
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
