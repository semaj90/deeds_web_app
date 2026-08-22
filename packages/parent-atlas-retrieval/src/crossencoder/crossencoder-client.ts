/**
 * CrossEncoder Reranker Client
 * Connects to CrossEncoder sidecar (port 8092)
 * Integrates as Phase C reranking stage after XGBoost/TurboVec
 *
 * Model: mixedbread-ai/mxbai-rerank-base-v2 (0.5B params, 384-dim output)
 * Port: 8092 (independent of SvelteKit and Gemma4)
 * Graceful fallback: returns null if sidecar unavailable
 */

import type { QdrantHit } from '../turbovec/turbovec-rerank.js';

export interface CrossEncoderCandidate {
  packet_key: string;
  text: string;
}

export interface CrossEncoderRerankRequest {
  query: string;
  candidates: CrossEncoderCandidate[];
  batch_size?: number;
}

export interface CrossEncoderRankedResult {
  packet_key: string;
  score: number;
}

export interface CrossEncoderRerankResponse {
  ranked: CrossEncoderRankedResult[];
  latency_ms: number;
  vram_peak_mb: number;
  vram_current_mb: number;
  model_loaded: boolean;
  batch_count: number;
}

export interface CrossEncoderHealthStatus {
  status: 'healthy' | 'unhealthy';
  model_loaded: boolean;
  device: string;
  model_id: string;
}

/**
 * Get CrossEncoder sidecar URL from environment or default
 */
function getCrossEncoderUrl(): string {
  const raw = (process.env.CROSSENCODER_SIDECAR || 'http://127.0.0.1:8092').trim();
  return raw.startsWith('http') ? raw : `http://${raw}`;
}

/**
 * Check if CrossEncoder sidecar is available
 * Non-blocking: timeout 5s, returns null on failure
 */
export async function checkCrossEncoderHealth(): Promise<CrossEncoderHealthStatus | null> {
  const url = getCrossEncoderUrl();
  try {
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) return null;
    return (await res.json()) as CrossEncoderHealthStatus;
  } catch (err) {
    console.warn('[crossencoder-client] health check failed:', err);
    return null;
  }
}

/**
 * Rerank candidates using CrossEncoder
 * Returns null if sidecar unavailable (graceful fallback)
 *
 * @param query - Query text
 * @param candidates - Candidates with packet_key and text
 * @param batchSize - Optional batch size (default 8, max 64)
 * @returns Ranked results or null on failure
 */
export async function rerankCandidates(
  query: string,
  candidates: CrossEncoderCandidate[],
  batchSize: number = 8
): Promise<CrossEncoderRankedResult[] | null> {
  if (!candidates || candidates.length === 0) return [];

  const url = getCrossEncoderUrl();
  try {
    const payload: CrossEncoderRerankRequest = {
      query,
      candidates,
      batch_size: Math.max(1, Math.min(64, batchSize))
    };

    const res = await fetch(`${url}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
      console.warn(`[crossencoder-client] rerank failed: HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as CrossEncoderRerankResponse;
    return data.ranked || [];
  } catch (err) {
    console.warn('[crossencoder-client] rerank unavailable, falling back:', err);
    return null;
  }
}

/**
 * Apply CrossEncoder reranking to Qdrant hits
 * Extracts text from hits, calls reranker, maps scores back
 *
 * @param query - Query text
 * @param hits - Qdrant hits with semantic_score
 * @param topK - Slice to top K after reranking (optional)
 * @returns Reranked hits with crossencoder_score added, or null on failure
 */
export async function applyReranking(
  query: string,
  hits: (QdrantHit & { crossencoder_score?: number })[],
  topK?: number
): Promise<(QdrantHit & { crossencoder_score: number })[] | null> {
  if (!hits || hits.length === 0) return [];

  // Extract candidates for reranking
  const candidates: CrossEncoderCandidate[] = hits.map((hit) => ({
    packet_key: String(hit.id),
    text: String(hit.payload?.content || hit.payload?.text || '')
  }));

  // Call reranker
  const ranked = await rerankCandidates(query, candidates);
  if (!ranked) return null; // Sidecar unavailable

  // Map reranker scores back to hits
  const scoreMap = new Map(ranked.map((r) => [r.packet_key, r.score]));
  const reranked = hits
    .map((hit) => ({
      ...hit,
      crossencoder_score: scoreMap.get(String(hit.id)) || 0
    }))
    .sort((a, b) => (b.crossencoder_score || 0) - (a.crossencoder_score || 0))
    .slice(0, topK);

  return reranked as (QdrantHit & { crossencoder_score: number })[];
}

/**
 * Blend CrossEncoder score with existing semantic score
 * Weight: crossencoder 0.30, semantic 0.70 (tunable)
 *
 * @param hit - Hit with semantic_score and optional crossencoder_score
 * @param ceWeight - CrossEncoder weight (default 0.30)
 * @returns Blended score
 */
export function blendCrossEncoderScore(
  hit: QdrantHit & { crossencoder_score?: number },
  ceWeight: number = 0.30
): number {
  const semantic = hit.score || 0;
  const crossencoder = hit.crossencoder_score || 0;
  return semantic * (1 - ceWeight) + crossencoder * ceWeight;
}
