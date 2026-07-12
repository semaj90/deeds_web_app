/**
 * CUDA Graph Rerank Hook — stub/type shim
 *
 * This module provides a GPU-accelerated cosine-similarity reranker for ACE
 * candidate sets. The actual CUDA implementation lives in the Python worker
 * (python-workers/consumer_topology_kmeans.py) via RabbitMQ.
 *
 * This JS stub provides the same interface so the query-router can safely
 * import it without crashing in environments where the GPU worker is not
 * wired yet. shouldRerank() returns false by default so the rerank path
 * is a no-op until the full RabbitMQ round-trip is implemented.
 */

export interface RerankCandidate {
  id: string;
  metadata: { embedding: number[] | Float32Array; score: number };
  source_ref: string;
  payload: Record<string, unknown>;
}

export interface RerankResult {
  hits: Array<{ id: string; score: number }>;
  latency_ms: number;
}

export interface RerankOptions {
  maxCandidates?: number;
  logTelemetry?: boolean;
}

/**
 * Returns true when the batch size warrants GPU reranking.
 * Currently disabled — returns false until the RabbitMQ consumer is wired.
 */
export function shouldRerank(_candidateCount: number): boolean {
  return false;
}

/**
 * Rerank ACE candidates using GPU-accelerated cosine similarity.
 * No-op stub: returns hits in original order with unchanged scores.
 */
export async function reankACECandidates(
  _queryVec: Float32Array,
  candidates: RerankCandidate[],
  _opts: RerankOptions = {}
): Promise<RerankResult> {
  const t0 = Date.now();
  return {
    hits: candidates.map((c) => ({ id: c.id, score: c.metadata.score })),
    latency_ms: Date.now() - t0,
  };
}
