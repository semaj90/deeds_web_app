// Policy:
//   - Qdrant succeeds → Qdrant result is canonical; cuVS result is advisory only
//   - cuVS enabled and healthy → optionally run comparison or large-batch rerank lane
//   - cuVS fails → no degradation of normal search; callers must handle empty returns
//   - Do NOT fan out to Qdrant AND cuVS on every interactive query; use cuVS for
//     offline benchmarking or explicit large-batch prefilter passes only
//
// Rewritten 2026-08-21 to match the real python/atlas_rapids_sidecar.py contract
// (previously this client called a nonexistent :8797 /search endpoint — there was
// never a matching server, and createCuvsSidecarClient had zero call sites). The
// real sidecar has no persistent server-side index for /v1/knn/exact and
// /v1/knn/cagra — every call sends its own corpus and builds a fresh GPU index,
// matching this file's own "explicit large-batch prefilter passes" policy above.
// A separate resident-index registry (atlas_cuvs_resident_sidecar.py, POST
// /v1/indexes/build + POST /search) exists for repeated searches against a
// standing index — not wired here; add a second client function if a caller
// needs that shape.

import { ENV } from '$lib/server/env.server.js';
// This file's index names ('content768'/'summary768') and dimension hardcode
// the native 768-dim EmbeddingGemma output — matching the real sidecar's
// `_EXPECTED_DIMENSION = 768` (python/atlas_rapids_sidecar.py) — not the
// persisted canonical semantic_512 lane. Aliased to the native-dimension
// constant, not the canonical-persisted one.
import { ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION as SEMANTIC_DIMENSION } from './qdrant-semantic-projection.js';

export type CuvsKnnAlgorithm = 'exact' | 'cagra';

export type CuvsCorpusRow = {
  packetKey: string;
  sourceRevision: string;
  symbolVersionId?: string | null;
  vector: number[];
};

/**
 * Every corpus row and the query itself must carry real identity — the real
 * sidecar fails closed on missing packetKey/sourceRevision, duplicate
 * identity, and dimension mismatch (python/atlas_rapids_sidecar.py
 * _validate_knn_request). This client does not pre-validate identity beyond
 * dimension — let the sidecar's own fail-closed checks be the single source
 * of truth rather than duplicating them here and risking drift.
 */
export type CuvsExactKnnRequest = {
  algorithm?: CuvsKnnAlgorithm;
  representationId: string;
  dimension: typeof SEMANTIC_DIMENSION;
  vector: number[];
  corpus: CuvsCorpusRow[];
  topK: number;
  /** Relative budget in ms from request receipt — see ExactKnnRequest.deadlineMs in the sidecar. */
  deadlineMs?: number;
};

export type CuvsKnnHit = {
  rank: number;
  packetKey: string;
  sourceRevision: string;
  symbolVersionId: string | null;
  distance: number;
};

export interface CuvsSidecarHealth {
  ready: boolean;
  gpuAvailable: boolean;
  cuvsAvailable: boolean;
  cuvsVersion?: string;
}

export interface CuvsSidecarClient {
  health(): Promise<CuvsSidecarHealth>;
  knnExact(input: CuvsExactKnnRequest): Promise<CuvsKnnHit[]>;
}

const HEALTH_CACHE_TTL = 30_000;

let _cachedHealth: CuvsSidecarHealth | null = null;
let _healthCacheTs = 0;

function getBaseUrl(baseUrl?: string): string {
  // CUVS_SIDECAR_URL is the dedicated sidecar; CUVS_BENCH_URL is the benchmarking lane.
  // 8098 matches ATLAS_RAPIDS_SIDECAR_PORT's default in atlas_rapids_sidecar.py.
  return (
    baseUrl ??
    (process.env['CUVS_SIDECAR_URL'] || ENV.CUVS_BENCH_URL || 'http://127.0.0.1:8098')
  );
}

export function createCuvsSidecarClient(baseUrl?: string): CuvsSidecarClient {
  const url = getBaseUrl(baseUrl);

  return {
    async health(): Promise<CuvsSidecarHealth> {
      const now = Date.now();
      if (_cachedHealth !== null && now - _healthCacheTs < HEALTH_CACHE_TTL) {
        return _cachedHealth;
      }

      const unhealthy: CuvsSidecarHealth = { ready: false, gpuAvailable: false, cuvsAvailable: false };

      try {
        const res = await fetch(`${url}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) {
          _cachedHealth = unhealthy;
          _healthCacheTs = now;
          return _cachedHealth;
        }
        const data = (await res.json()) as {
          status?: string;
          gpu?: { available?: boolean };
          packages?: { cuvs?: { available?: boolean; version?: string } };
        };
        _cachedHealth = {
          ready: data.status === 'ok',
          gpuAvailable: Boolean(data.gpu?.available),
          cuvsAvailable: Boolean(data.packages?.cuvs?.available),
          cuvsVersion: data.packages?.cuvs?.version,
        };
        _healthCacheTs = now;
        return _cachedHealth;
      } catch {
        _cachedHealth = unhealthy;
        _healthCacheTs = now;
        return _cachedHealth;
      }
    },

    async knnExact(input: CuvsExactKnnRequest): Promise<CuvsKnnHit[]> {
      if (input.vector.length !== input.dimension) {
        throw new Error(
          `CUVS_DIMENSION_MISMATCH: query expects ${input.dimension}-dim, received ${input.vector.length}`,
        );
      }

      const endpoint = input.algorithm === 'cagra' ? '/v1/knn/cagra' : '/v1/knn/exact';

      try {
        const res = await fetch(`${url}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: {
              vector: input.vector,
              representationId: input.representationId,
              dimension: input.dimension,
            },
            corpus: input.corpus.map((row) => ({
              packetKey: row.packetKey,
              sourceRevision: row.sourceRevision,
              symbolVersionId: row.symbolVersionId ?? null,
              vector: row.vector,
            })),
            topK: input.topK,
            deadlineMs: input.deadlineMs,
          }),
          // Each call builds a fresh GPU index over the whole corpus (no
          // persistent server-side state) — large corpora take longer than a
          // resident-index search, hence the wider budget than a typical fetch.
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
          // Force a fresh health probe on the next call rather than trusting
          // a cached "ready" while a real request just failed.
          _cachedHealth = null;
          return [];
        }

        const data = (await res.json()) as { results?: CuvsKnnHit[] };
        return data.results ?? [];
      } catch {
        // Sidecar unavailability must never surface to the caller as an error —
        // Qdrant is canonical and the caller proceeds without cuVS results.
        _cachedHealth = null;
        return [];
      }
    },
  };
}
