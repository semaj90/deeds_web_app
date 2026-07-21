/**
 * Miniforge ML Sidecar Client
 * Routes ranking/classification requests to the Miniforge Python ML pipeline
 * (Naive Bayes, XGBoost, cuVS, RAPIDS on CUDA)
 */

import type { RequestInit } from 'node-fetch';

export interface MLSidecarRankRequest {
  candidates: Array<{
    id: string;
    text: string;
    source: 'qdrant' | 'web' | 'ldr' | 'cache';
    score?: number; // optional upstream score
  }>;
  query: string;
  model: 'xgboost' | 'naive_bayes' | 'cuVS';
  top_k?: number;
}

export interface MLSidecarRankResponse {
  ranked: Array<{
    id: string;
    text: string;
    source: string;
    upstream_score?: number;
    ml_score: number; // XGBoost/Naive Bayes output
    rank: number;
  }>;
  model_used: string;
  duration_ms: number;
}

export interface MLSidecarClassifyRequest {
  text: string;
  model: 'domain_classifier' | 'semantic_tagger';
  top_k?: number;
}

export interface MLSidecarClassifyResponse {
  classifications: Array<{
    label: string;
    confidence: number;
  }>;
  model_used: string;
  duration_ms: number;
}

export interface MLSidecarClusterRequest {
  vectors: number[][];
  n_clusters?: number;
  algorithm: 'cuVS_kmeans' | 'rapids_umap';
}

export interface MLSidecarClusterResponse {
  cluster_ids: number[];
  centroids: number[][];
  algorithm_used: string;
  duration_ms: number;
}

const MINIFORGE_SIDECAR_URL = process.env.MINIFORGE_SIDECAR_URL || 'http://127.0.0.1:8095';

/**
 * Health check for Miniforge sidecar
 */
export async function checkMiniforgeSidecarHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${MINIFORGE_SIDECAR_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Rank candidates using ML sidecar (XGBoost or Naive Bayes)
 */
export async function rankCandidates(
  req: MLSidecarRankRequest,
): Promise<MLSidecarRankResponse> {
  const health = await checkMiniforgeSidecarHealth();
  if (!health) {
    throw new Error(
      `Miniforge ML sidecar unavailable at ${MINIFORGE_SIDECAR_URL}. ` +
        'Start with: conda activate ldr && python -m ml_sidecar.server',
    );
  }

  const response = await fetch(`${MINIFORGE_SIDECAR_URL}/rank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(
      `ML ranking failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<MLSidecarRankResponse>;
}

/**
 * Classify text using ML sidecar (domain classifier or semantic tagger)
 */
export async function classifyText(
  req: MLSidecarClassifyRequest,
): Promise<MLSidecarClassifyResponse> {
  const health = await checkMiniforgeSidecarHealth();
  if (!health) {
    throw new Error(
      `Miniforge ML sidecar unavailable at ${MINIFORGE_SIDECAR_URL}`,
    );
  }

  const response = await fetch(`${MINIFORGE_SIDECAR_URL}/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(
      `ML classification failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<MLSidecarClassifyResponse>;
}

/**
 * Cluster vectors using cuVS (GPU-accelerated) or RAPIDS UMAP
 */
export async function clusterVectors(
  req: MLSidecarClusterRequest,
): Promise<MLSidecarClusterResponse> {
  const health = await checkMiniforgeSidecarHealth();
  if (!health) {
    throw new Error(
      `Miniforge ML sidecar unavailable at ${MINIFORGE_SIDECAR_URL}`,
    );
  }

  const response = await fetch(`${MINIFORGE_SIDECAR_URL}/cluster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    throw new Error(
      `ML clustering failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<MLSidecarClusterResponse>;
}

/**
 * Get model info (versions, CUDA status, etc.)
 */
export async function getModelInfo(): Promise<Record<string, unknown>> {
  const health = await checkMiniforgeSidecarHealth();
  if (!health) {
    throw new Error(
      `Miniforge ML sidecar unavailable at ${MINIFORGE_SIDECAR_URL}`,
    );
  }

  const response = await fetch(`${MINIFORGE_SIDECAR_URL}/info`, {
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch model info: ${response.status}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}
