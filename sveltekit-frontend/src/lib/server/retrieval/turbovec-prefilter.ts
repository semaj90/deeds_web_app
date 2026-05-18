/**
 * turbovec-prefilter.ts
 * Thin client for the TurboVec ANN sidecar at :8099.
 * Wraps /prefilter and /search endpoints with a configurable timeout + graceful fallback.
 */

import { ENV } from '$lib/server/env.server.js';

export interface TurboVecPrefilterResult {
  clusterIds: number[];
  centroidScores: Record<string, number>;
  backend: 'python' | 'js' | 'offline';
  durationMs: number;
}

export interface TurboVecSearchResult {
  candidates: Array<{ id: string; score: number; cluster: number }>;
  backend: 'python' | 'js' | 'offline';
  durationMs: number;
}

const EMPTY_PREFILTER: TurboVecPrefilterResult = {
  clusterIds: [],
  centroidScores: {},
  backend: 'offline',
  durationMs: 0,
};

const EMPTY_SEARCH: TurboVecSearchResult = {
  candidates: [],
  backend: 'offline',
  durationMs: 0,
};

function sidecarUrl(): string {
  return (ENV as any).TURBOVEC_SIDECAR ?? 'http://127.0.0.1:8099';
}

/**
 * Call /prefilter — returns top cluster IDs for injecting into a Qdrant `must` filter.
 * Times out after `opts.timeoutMs` (default 250ms). Returns empty result on failure.
 */
export async function turbovecPrefilter(
  embedding: Float32Array | number[],
  opts: { topClusters?: number; timeoutMs?: number } = {}
): Promise<TurboVecPrefilterResult> {
  const t0 = Date.now();
  const timeoutMs = opts.timeoutMs ?? 250;
  try {
    const res = await fetch(`${sidecarUrl()}/prefilter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: Array.from(embedding),
        topClusters: opts.topClusters ?? 5,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return EMPTY_PREFILTER;
    const data = await res.json();
    return {
      clusterIds: data.clusterIds ?? [],
      centroidScores: data.centroidScores ?? {},
      backend: data.backend ?? 'js',
      durationMs: Date.now() - t0,
    };
  } catch {
    return { ...EMPTY_PREFILTER, durationMs: Date.now() - t0 };
  }
}

/**
 * Call /search — returns ANN candidate point IDs for score-boosting (not hard filtering).
 * Times out after `opts.timeoutMs` (default 300ms). Returns empty result on failure.
 */
export async function turbovecSearch(
  embedding: Float32Array | number[],
  opts: { topK?: number; timeoutMs?: number } = {}
): Promise<TurboVecSearchResult> {
  const t0 = Date.now();
  const timeoutMs = opts.timeoutMs ?? 300;
  try {
    const res = await fetch(`${sidecarUrl()}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: Array.from(embedding),
        topK: opts.topK ?? 200,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return EMPTY_SEARCH;
    const data = await res.json();
    return {
      candidates: data.candidates ?? [],
      backend: data.backend ?? 'js',
      durationMs: Date.now() - t0,
    };
  } catch {
    return { ...EMPTY_SEARCH, durationMs: Date.now() - t0 };
  }
}

/**
 * Health check — returns sidecar status or null if offline.
 */
export async function turbovecHealth(): Promise<{
  ok: boolean;
  indexed: number;
  dim: number;
  bits: number;
  backend: string;
} | null> {
  try {
    const res = await fetch(`${sidecarUrl()}/health`, {
      signal: AbortSignal.timeout(500),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
