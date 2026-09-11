/**
 * CrossEncoder Reranker Client
 * Connects to CrossEncoder sidecar (port 8092).
 *
 * The client consumes a minimal package-local retrieval-hit contract. It does
 * not import or own TurboVec/Qdrant execution; application-owned retrieval
 * lanes adapt their hits at the package boundary.
 */

import type { QdrantHit } from './retrieval-contract.js';
export type { QdrantHit } from './retrieval-contract.js';

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

function getCrossEncoderUrl(): string {
  const raw = (process.env.CROSSENCODER_SIDECAR || 'http://127.0.0.1:8092').trim();
  return raw.startsWith('http') ? raw : `http://${raw}`;
}

export async function checkCrossEncoderHealth(): Promise<CrossEncoderHealthStatus | null> {
  const url = getCrossEncoderUrl();
  try {
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) return null;
    const payload = (await res.json()) as Partial<CrossEncoderHealthStatus>;
    if (
      (payload.status !== 'healthy' && payload.status !== 'unhealthy') ||
      typeof payload.model_loaded !== 'boolean' ||
      typeof payload.device !== 'string' ||
      typeof payload.model_id !== 'string'
    ) {
      return null;
    }
    return payload as CrossEncoderHealthStatus;
  } catch (err) {
    console.warn('[crossencoder-client] health check failed:', err);
    return null;
  }
}

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

export async function applyReranking(
  query: string,
  hits: (QdrantHit & { crossencoder_score?: number })[],
  topK?: number
): Promise<(QdrantHit & { crossencoder_score: number })[] | null> {
  if (!hits || hits.length === 0) return [];

  const candidates: CrossEncoderCandidate[] = hits.map((hit) => ({
    packet_key: String(hit.id),
    text: String(hit.payload?.content || hit.payload?.text || '')
  }));

  const ranked = await rerankCandidates(query, candidates);
  if (!ranked) return null;

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

export function blendCrossEncoderScore(
  hit: QdrantHit & { crossencoder_score?: number },
  ceWeight: number = 0.30
): number {
  const semantic = hit.score || 0;
  if (hit.crossencoder_score == null) return semantic;
  const crossencoder = hit.crossencoder_score;
  return semantic * (1 - ceWeight) + crossencoder * ceWeight;
}
