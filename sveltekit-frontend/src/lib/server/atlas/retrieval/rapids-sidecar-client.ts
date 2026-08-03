import { ENV } from '$lib/server/env.server.js';

export interface RapidsSidecarHealthResponse {
  status: string;
  uptime_s?: number;
  gpu?: {
    available?: boolean;
    device_name?: string | null;
    memory?: {
      free_mb?: number | null;
      total_mb?: number | null;
      used_mb?: number | null;
      error?: string;
    } | null;
  };
  packages?: Record<string, unknown>;
  timestamp?: number;
}

export interface RapidsSidecarCapabilityOperation {
  op: string;
  status: string;
  note?: string;
  reason?: string;
  backend?: string;
  backend_version?: string;
  max_corpus_rows?: number;
  min_free_gpu_mb?: number;
}

export interface RapidsSidecarCapabilitiesResponse {
  sidecar_version: string;
  schema_version: number;
  operations: RapidsSidecarCapabilityOperation[];
  gpu_memory?: {
    free_mb?: number | null;
    total_mb?: number | null;
    used_mb?: number | null;
    error?: string;
  } | null;
  row_identity_contract: string;
  timestamp?: number;
}

export interface RapidsKnnQuery {
  vector: number[];
  representationId: string;
  dimension: number;
}

export interface RapidsKnnCorpusRow {
  packetKey: string;
  sourceRevision: string;
  symbolVersionId?: string | null;
  vector: number[];
}

export interface RapidsExactKnnRequest {
  query: RapidsKnnQuery;
  corpus: RapidsKnnCorpusRow[];
  topK: number;
  deadlineMs?: number | null;
}

export interface RapidsKnnHit {
  rank: number;
  packetKey: string;
  sourceRevision: string;
  symbolVersionId?: string | null;
  distance: number;
}

export interface RapidsKnnResponse {
  operation: 'knn.exact' | 'knn.cagra';
  backend: 'cuvs.brute_force' | 'cuvs.cagra';
  representationId: string;
  dimension: number;
  results: RapidsKnnHit[];
  corpusRows: number;
  gpuMemoryBeforeMb: number | null;
  gpuMemoryAfterMb: number | null;
  durationMs: number;
  truncated: boolean;
}

export interface RapidsSidecarClient {
  baseUrl: string;
  health(options?: { timeoutMs?: number }): Promise<RapidsSidecarHealthResponse>;
  capabilities(options?: { timeoutMs?: number }): Promise<RapidsSidecarCapabilitiesResponse>;
  knnExact(request: RapidsExactKnnRequest, options?: { timeoutMs?: number }): Promise<RapidsKnnResponse>;
  knnCagra(request: RapidsExactKnnRequest, options?: { timeoutMs?: number }): Promise<RapidsKnnResponse>;
}

function resolveRapidsSidecarBaseUrl(baseUrl?: string): string {
  return (baseUrl ?? ENV.ATLAS_RAPIDS_SIDECAR_URL ?? 'http://127.0.0.1:8098').replace(/\/+$/, '');
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

async function readJson<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) {
    const body = await safeReadText(response);
    throw new Error(
      `[rapids-sidecar-client] ${context} failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`,
    );
  }

  return (await response.json()) as T;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeKnnResponse(
  raw: Record<string, unknown>,
  request: RapidsExactKnnRequest,
  operation: RapidsKnnResponse['operation'],
  backend: RapidsKnnResponse['backend'],
): RapidsKnnResponse {
  const results = Array.isArray(raw.results) ? raw.results : [];

  return {
    operation,
    backend,
    representationId:
      typeof raw.representationId === 'string' && raw.representationId.trim()
        ? raw.representationId
        : request.query.representationId,
    dimension: toNumber(raw.dimension) || request.query.dimension,
    results: results.map((item, index) => {
      const row = item as Record<string, unknown>;
      return {
        rank: toNumber(row.rank) || index + 1,
        packetKey: String(row.packetKey ?? ''),
        sourceRevision: String(row.sourceRevision ?? ''),
        symbolVersionId:
          typeof row.symbolVersionId === 'string'
            ? row.symbolVersionId
            : row.symbolVersionId === null
              ? null
              : undefined,
        distance: toNumber(row.distance),
      };
    }),
    corpusRows: toNumber(raw.corpusRows) || request.corpus.length,
    gpuMemoryBeforeMb: toNullableNumber(raw.gpuMemoryBeforeMb),
    gpuMemoryAfterMb: toNullableNumber(raw.gpuMemoryAfterMb),
    durationMs: toNumber(raw.durationMs),
    truncated: Boolean(raw.truncated),
  };
}

async function postKnn(
  baseUrl: string,
  endpoint: '/v1/knn/exact' | '/v1/knn/cagra',
  request: RapidsExactKnnRequest,
  options: { timeoutMs?: number } = {},
): Promise<RapidsKnnResponse> {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
  });

  const raw = await readJson<Record<string, unknown>>(response, endpoint);
  const operation = endpoint === '/v1/knn/cagra' ? 'knn.cagra' : 'knn.exact';
  const backend = endpoint === '/v1/knn/cagra' ? 'cuvs.cagra' : 'cuvs.brute_force';
  return normalizeKnnResponse(raw, request, operation, backend);
}

export function createRapidsSidecarClient(baseUrl?: string): RapidsSidecarClient {
  const resolvedBaseUrl = resolveRapidsSidecarBaseUrl(baseUrl);

  return {
    baseUrl: resolvedBaseUrl,

    async health(options: { timeoutMs?: number } = {}): Promise<RapidsSidecarHealthResponse> {
      const response = await fetch(`${resolvedBaseUrl}/health`, {
        signal: AbortSignal.timeout(options.timeoutMs ?? 3_000),
      });
      return readJson<RapidsSidecarHealthResponse>(response, 'health');
    },

    async capabilities(options: { timeoutMs?: number } = {}): Promise<RapidsSidecarCapabilitiesResponse> {
      const response = await fetch(`${resolvedBaseUrl}/v1/capabilities`, {
        signal: AbortSignal.timeout(options.timeoutMs ?? 3_000),
      });
      return readJson<RapidsSidecarCapabilitiesResponse>(response, 'capabilities');
    },

    async knnExact(
      request: RapidsExactKnnRequest,
      options: { timeoutMs?: number } = {},
    ): Promise<RapidsKnnResponse> {
      return postKnn(resolvedBaseUrl, '/v1/knn/exact', request, options);
    },

    async knnCagra(
      request: RapidsExactKnnRequest,
      options: { timeoutMs?: number } = {},
    ): Promise<RapidsKnnResponse> {
      return postKnn(resolvedBaseUrl, '/v1/knn/cagra', request, options);
    },
  };
}
