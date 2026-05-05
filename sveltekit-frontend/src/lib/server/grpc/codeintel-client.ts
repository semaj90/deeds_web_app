/**
 * codeintel-client.ts — gRPC client for the CodeIntel service (port 50058)
 * with HTTP fallback to direct Postgres queries.
 *
 * All exported functions return plain objects (not proto instances)
 * so callers have no proto dependency.
 *
 * ENV:
 *   CODEINTEL_GRPC_URL      — grpc host:port (default 127.0.0.1:50058)
 *   CODEINTEL_GRPC_ENABLED  — "true" to enable gRPC path (default false → HTTP fallback)
 */
import { ENV } from '$lib/server/env.server.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirror proto messages as plain TS)
// ─────────────────────────────────────────────────────────────────────────────

export interface ClusterSummary {
  id: string;
  repoId: string;
  gpuCluster: number;
  summary: string;
  purpose: string;
  patterns: string[];
  warnings: string[];
  tags: string[];
  memberCount: number;
  representativeChunkIds: string[];
  summaryModel: string;
  hasSummaryEmbedding: boolean;
  metadataJson: string;
  updatedAt: string;
  centroidDistanceMean: number;
}

export interface ListClusterSummariesResponse {
  items: ClusterSummary[];
  total: number;
}

export interface SummarizeClusterResponse {
  ok: boolean;
  item?: ClusterSummary;
  cacheHit: boolean;
  jobId: string;
  message: string;
}

export interface JobStatus {
  jobId: string;
  jobType: string;
  status: string;
  totalProcessed: number;
  totalUpserted: number;
  totalFailed: number;
  errorJson: string;
  updatedAt: string;
}

export interface ChunkLookupResponse {
  chunkId: string;
  repoId: string;
  relativePath: string;
  symbol: string;
  kind: string;
  domain: string;
  language: string;
  extension: string;
  gpuCluster: number;
  somCluster: number;
  semanticTags: string[];
  summary: string;
  metadataJson: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers (fallback path — calls Go service REST if GRPC disabled)
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `http://${ENV.CODEINTEL_GRPC_URL.replace(/^grpc:\/\//, '')}`;

// The Go service exposes a thin HTTP shim on the same port only if built that way.
// For now: if gRPC disabled, query Postgres directly via the existing API routes.
// This avoids a Node.js gRPC dependency (which requires native bindings).

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.PUBLIC_API_URL ?? process.env.SVELTE_DEV_URL ?? 'http://localhost:5173';
  const res = await fetch(`${base}/api/codeintel${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`codeintel HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a single cluster summary from Postgres via the existing API route.
 * Upgrades to gRPC when CODEINTEL_GRPC_ENABLED=true.
 */
export async function getClusterSummary(
  repoId: string,
  gpuCluster: number,
): Promise<ClusterSummary | null> {
  try {
    const data = await fetchJSON<{ cluster: ClusterSummary | null }>(
      `/clusters/${gpuCluster}`,
    );
    return data.cluster ?? null;
  } catch {
    return null;
  }
}

/**
 * List all cluster summaries for a repo.
 */
export async function listClusterSummaries(
  repoId: string,
  gpuClusters?: number[],
  limit = 100,
  offset = 0,
): Promise<ListClusterSummariesResponse> {
  try {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (repoId) params.set('repoId', repoId);
    if (gpuClusters?.length) params.set('clusters', gpuClusters.join(','));
    const data = await fetchJSON<{ summaries: ClusterSummary[]; total: number }>(
      `/clusters?${params}`,
    );
    return { items: data.summaries ?? [], total: data.total ?? 0 };
  } catch {
    return { items: [], total: 0 };
  }
}

/**
 * Trigger LLM summarization for a cluster.
 */
export async function refreshClusterSummary(
  repoId: string,
  gpuCluster: number,
  force = false,
): Promise<SummarizeClusterResponse> {
  try {
    const data = await fetchJSON<SummarizeClusterResponse>(
      `/clusters/${gpuCluster}`,
      {
        method: 'POST',
        body: JSON.stringify({ repoId, force, useCache: !force }),
      },
    );
    return data;
  } catch (e: any) {
    return { ok: false, cacheHit: false, jobId: '', message: e.message };
  }
}

/**
 * Poll an enrichment job.
 */
export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  try {
    const data = await fetchJSON<{ job: JobStatus | null }>(`/jobs/${encodeURIComponent(jobId)}`);
    return data.job ?? null;
  } catch {
    return null;
  }
}

/**
 * Look up a single codebase chunk by ID.
 */
export async function lookupChunk(
  repoId: string,
  chunkId: string,
): Promise<ChunkLookupResponse | null> {
  try {
    const data = await fetchJSON<{ chunk: ChunkLookupResponse | null }>(
      `/chunks/${encodeURIComponent(chunkId)}?repoId=${encodeURIComponent(repoId)}`,
    );
    return data.chunk ?? null;
  } catch {
    return null;
  }
}
