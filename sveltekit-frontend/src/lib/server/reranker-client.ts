/**
 * CrossEncoder reranker HTTP client.
 * Communicates with reranker sidecar on port 8092.
 * Graceful fallback: if sidecar unavailable, returns null (caller uses XGBoost ranking).
 */

export interface RerankerCandidate {
  packet_key: string;
  text: string;
}

export interface RerankerResult {
  packet_key: string;
  score: number;
}

export interface RerankerResponse {
  ranked: RerankerResult[];
  latency_ms: number;
  vram_peak_mb: number;
  vram_current_mb: number;
  model_loaded: boolean;
  batch_count: number;
}

export interface RerankerHealthStatus {
  status: "healthy" | "unhealthy";
  model_loaded: boolean;
  device: "cuda" | "cpu";
  model_id: string;
  latency_ms?: number;
}

const RERANKER_URL = process.env.RERANKER_URL || "http://127.0.0.1:8092";
const RERANKER_TIMEOUT_MS = 5000;

/**
 * Check if reranker sidecar is available.
 */
export async function checkRerankerHealth(): Promise<RerankerHealthStatus | null> {
  try {
    const res = await fetch(`${RERANKER_URL}/health`, {
      signal: AbortSignal.timeout(RERANKER_TIMEOUT_MS),
    });

    if (!res.ok) return null;

    const data = await res.json();
    return {
      status: data.status === "healthy" ? "healthy" : "unhealthy",
      model_loaded: data.model_loaded,
      device: data.device,
      model_id: data.model_id,
    };
  } catch (err) {
    console.warn("[Reranker] Health check failed:", err);
    return null;
  }
}

/**
 * Rerank candidates using CrossEncoder sidecar.
 * Returns ranked results or null if sidecar unavailable (caller falls back to XGBoost).
 */
export async function rerankCandidates(
  query: string,
  candidates: RerankerCandidate[],
  batchSize: number = 8
): Promise<RerankerResponse | null> {
  if (!candidates.length) return null;

  try {
    const res = await fetch(`${RERANKER_URL}/rerank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        candidates,
        batch_size: batchSize,
      }),
      signal: AbortSignal.timeout(RERANKER_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(`[Reranker] HTTP ${res.status}:`, await res.text());
      return null;
    }

    const data: RerankerResponse = await res.json();
    return data;
  } catch (err) {
    console.warn("[Reranker] Request failed:", err);
    return null;
  }
}

/**
 * Apply reranking stage if sidecar available, otherwise return candidates unchanged.
 * Used in the retrieval pipeline: XGBoost top-20 → rerank → top-5
 */
export async function applyReranking(
  query: string,
  xgboostRanked: Array<{ packet_key: string; text: string; xgboost_score: number }>,
  topK: number = 5
): Promise<
  Array<{
    packet_key: string;
    text: string;
    xgboost_score: number;
    reranker_score: number;
    is_reranked: boolean;
  }>
> {
  const candidates = xgboostRanked.map((c) => ({
    packet_key: c.packet_key,
    text: c.text,
  }));

  const rerankerRes = await rerankCandidates(query, candidates);

  if (!rerankerRes) {
    // Fallback: return XGBoost ranking unchanged
    return xgboostRanked.map((c) => ({
      ...c,
      reranker_score: c.xgboost_score,
      is_reranked: false,
    }));
  }

  // Map reranker scores back to candidates
  const scoreMap = new Map<string, number>(
    rerankerRes.ranked.map((r) => [r.packet_key, r.score])
  );

  return xgboostRanked
    .slice(0, topK)
    .map((c) => ({
      ...c,
      reranker_score: scoreMap.get(c.packet_key) ?? c.xgboost_score,
      is_reranked: true,
    }));
}
