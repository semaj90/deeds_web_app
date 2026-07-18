// Policy:
//   - Qdrant succeeds → Qdrant result is canonical; cuVS result is advisory only
//   - cuVS enabled and healthy → optionally run comparison or large-batch rerank lane
//   - cuVS fails → no degradation of normal search; callers must handle null returns
//   - Do NOT fan out to Qdrant AND cuVS on every interactive query; use cuVS for
//     offline benchmarking or explicit large-batch prefilter passes only

import { ENV } from '$lib/server/env.server.js';

export interface CuvsSidecarClient {
  health(): Promise<{ ready: boolean; indexVersion?: string }>;
  search(input: {
    index: 'content384' | 'summary384' | 'latent64';
    vector: number[];
    topK: number;
    allowedRowIds?: number[];
  }): Promise<Array<{ packetKey: string; score: number }>>;
}

const HEALTH_CACHE_TTL = 30_000;

let _cachedHealthy: boolean | null = null;
let _healthCacheTs = 0;

function getBaseUrl(baseUrl?: string): string {
  // CUVS_SIDECAR_URL is the dedicated sidecar; CUVS_BENCH_URL is the benchmarking lane
  return (
    baseUrl ??
    (process.env['CUVS_SIDECAR_URL'] || ENV.CUVS_BENCH_URL || 'http://127.0.0.1:8797')
  );
}

export function createCuvsSidecarClient(baseUrl?: string): CuvsSidecarClient {
  const url = getBaseUrl(baseUrl);

  return {
    async health(): Promise<{ ready: boolean; indexVersion?: string }> {
      const now = Date.now();
      if (_cachedHealthy !== null && now - _healthCacheTs < HEALTH_CACHE_TTL) {
        return { ready: _cachedHealthy };
      }

      try {
        const res = await fetch(`${url}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) {
          _cachedHealthy = false;
          _healthCacheTs = now;
          return { ready: false };
        }
        const data = (await res.json()) as { status?: string; index_version?: string };
        _cachedHealthy = data.status === 'ok' || data.status === 'healthy';
        _healthCacheTs = now;
        return { ready: _cachedHealthy, indexVersion: data.index_version };
      } catch {
        _cachedHealthy = false;
        _healthCacheTs = now;
        return { ready: false };
      }
    },

    async search(input: {
      index: 'content384' | 'summary384' | 'latent64';
      vector: number[];
      topK: number;
      allowedRowIds?: number[];
    }): Promise<Array<{ packetKey: string; score: number }>> {
      try {
        const res = await fetch(`${url}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            index: input.index,
            vector: input.vector,
            top_k: input.topK,
            allowed_row_ids: input.allowedRowIds,
          }),
          // GPU ANN is fast; 10s covers cold-start index load
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
          _cachedHealthy = false;
          _healthCacheTs = Date.now();
          return [];
        }

        const data = (await res.json()) as {
          results?: Array<{ packet_key: string; score: number }>;
        };
        return (data.results ?? []).map(r => ({
          packetKey: r.packet_key,
          score: r.score,
        }));
      } catch {
        // Sidecar unavailability must never surface to the caller as an error —
        // Qdrant is canonical and the caller proceeds without cuVS results.
        _cachedHealthy = false;
        _healthCacheTs = Date.now();
        return [];
      }
    },
  };
}
