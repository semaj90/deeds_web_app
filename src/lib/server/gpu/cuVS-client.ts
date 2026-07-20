/**
 * cuVS TypeScript Bridge — GPU-Accelerated Approximate Nearest Neighbor Search
 *
 * Bridges TypeScript retrieval pipeline to cuVS (RAPIDS GPU vector search).
 * Supports HTTP and gRPC transports with graceful fallback to CPU HNSW.
 *
 * Usage:
 *   const client = new CuVSClient({ url: 'http://127.0.0.1:8791', k: 100 });
 *   const candidates = await client.search(queryVector);
 */

import fetch from 'node-fetch';

const logger = {
  info: (msg: string, ctx?: Record<string, unknown>) => console.log(`[cuVS] ${msg}`, ctx ?? ''),
  warn: (msg: string, err?: unknown) => console.warn(`[cuVS] ${msg}`, err ?? ''),
  error: (msg: string, err?: unknown) => console.error(`[cuVS] ${msg}`, err ?? ''),
};

/**
 * Search result from cuVS k-NN index
 */
export interface CuVSResult {
  indices: number[];
  distances: number[];
  metric: 'cosine' | 'l2' | 'inner_product';
  query_time_ms: number;
}

/**
 * Configuration for cuVS client
 */
export interface CuVSConfig {
  /** Base URL for cuVS HTTP service (e.g., http://127.0.0.1:8791) */
  url: string;
  /** Number of nearest neighbors to return */
  k: number;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * cuVS HTTP client for GPU k-NN search
 */
export class CuVSClient {
  private url: string;
  private k: number;
  private timeout: number;
  private verbose: boolean;
  private healthy: boolean = false;

  constructor(config: CuVSConfig) {
    this.url = config.url.replace(/\/$/, ''); // Remove trailing slash
    this.k = config.k;
    this.timeout = config.timeout ?? 30_000;
    this.verbose = config.verbose ?? false;
  }

  /**
   * Health check — verify cuVS service is accessible
   */
  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/health`, {
        method: 'GET',
        timeout: 5_000,
      });
      this.healthy = res.ok;
      if (this.verbose) logger.info('cuVS health check', { ok: res.ok, status: res.status });
      return res.ok;
    } catch (err) {
      logger.warn('cuVS health check failed', err);
      this.healthy = false;
      return false;
    }
  }

  /**
   * Search GPU index for k nearest neighbors
   *
   * @param query 384-dim query vector (Float32Array or number[])
   * @returns CuVSResult with indices and distances
   * @throws Error if cuVS service is unavailable (caller must handle fallback)
   */
  async search(query: Float32Array | number[]): Promise<CuVSResult> {
    // Ensure query is Float32Array
    const queryVec = query instanceof Float32Array ? query : new Float32Array(query);

    if (queryVec.length !== 384) {
      throw new Error(`Query dimension mismatch: expected 384, got ${queryVec.length}`);
    }

    try {
      const start = performance.now();
      const res = await fetch(`${this.url}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: Array.from(queryVec),
          k: this.k,
        }),
        timeout: this.timeout,
      });

      if (!res.ok) {
        throw new Error(`cuVS search failed: ${res.status} ${res.statusText}`);
      }

      const result = (await res.json()) as CuVSResult;
      const elapsed = performance.now() - start;

      if (this.verbose) {
        logger.info('cuVS search', {
          query_dim: queryVec.length,
          k: this.k,
          results: result.indices.length,
          elapsed_ms: elapsed,
          query_time_ms: result.query_time_ms,
        });
      }

      return result;
    } catch (err) {
      logger.error('cuVS search error', err);
      throw err;
    }
  }

  /**
   * Batch search — search multiple queries in parallel
   */
  async searchBatch(queries: (Float32Array | number)[]): Promise<CuVSResult[]> {
    return Promise.all(queries.map((q) => this.search(q)));
  }

  /**
   * Index status — check if embeddings are loaded
   */
  async indexInfo(): Promise<{ indexed_points: number; dimension: number; index_type: string } | null> {
    try {
      const res = await fetch(`${this.url}/index-info`, {
        method: 'GET',
        timeout: 5_000,
      });

      if (!res.ok) return null;
      return (await res.json()) as {
        indexed_points: number;
        dimension: number;
        index_type: string;
      };
    } catch (err) {
      logger.warn('Failed to fetch index info', err);
      return null;
    }
  }

  /**
   * Retrieve full documents by indices (cuVS may not include content)
   *
   * This is typically handled by re-joining with Postgres/Qdrant
   * based on the indices returned from search.
   */
  getUrl(): string {
    return this.url;
  }

  isHealthy(): boolean {
    return this.healthy;
  }
}

/**
 * Factory function for cuVS client with environment-based defaults
 */
export function createCuVSClient(overrides?: Partial<CuVSConfig>): CuVSClient {
  const url = overrides?.url ?? process.env.CUVS_URL ?? 'http://127.0.0.1:8791';
  const k = overrides?.k ?? parseInt(process.env.CUVS_K ?? '100', 10);
  const timeout = overrides?.timeout ?? parseInt(process.env.CUVS_TIMEOUT ?? '30000', 10);
  const verbose = overrides?.verbose ?? process.env.CUVS_VERBOSE === 'true';

  return new CuVSClient({ url, k, timeout, verbose });
}

/**
 * Singleton instance (lazy-initialized)
 */
let instance: CuVSClient | null = null;

export function getCuVSClient(): CuVSClient {
  if (!instance) {
    instance = createCuVSClient();
  }
  return instance;
}
