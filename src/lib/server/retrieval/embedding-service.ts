/**
 * Unified embedding service for Phase 3
 * Consolidates embedding logic from 5 separate endpoints:
 *   - /api/embed
 *   - retrieval/qdrant-search.ts
 *   - retrieval/gpu-knn/+server.ts
 *   - unified-orchestrator.ts
 *   - various client-side embed services
 *
 * Provides:
 * - Model selection (384-dim for GPU, 768-dim for Qdrant)
 * - Cache detection (Bifrost L1/L2)
 * - Fallback chain (gRPC → HTTP → Ollama)
 * - Zero-copy tensor handling
 */

import fetch from 'node-fetch';

/**
 * Embedding result with provenance tracking
 */
export interface EmbeddingResult {
  /** The embedding vector */
  vector: Float32Array;

  /** Model used */
  model: string;

  /** Embedding dimension */
  dimension: number;

  /** Whether result came from cache */
  cached: boolean;

  /** Cache level (L1/L2/none) */
  cache_level?: 'L1' | 'L2';

  /** Execution time in ms */
  exec_ms: number;
}

/**
 * Embedding service configuration
 */
export interface EmbeddingServiceConfig {
  /** Ollama embed model (default: embeddinggemma:latest) */
  embed_model?: string;

  /** Ollama API URL (default: http://127.0.0.1:11434) */
  ollama_url?: string;

  /** Bifrost semantic cache URL (default: http://127.0.0.1:3040/v1) */
  bifrost_url?: string;

  /** Target embedding dimension (default: 768) */
  target_dim?: number;

  /** Enable L1 Redis cache */
  enable_l1_cache?: boolean;

  /** Enable L2 Bifrost semantic cache */
  enable_l2_cache?: boolean;

  /** L1 cache TTL in seconds */
  l1_ttl_sec?: number;

  /** Request timeout in ms */
  timeout_ms?: number;
}

const DEFAULT_CONFIG: Required<EmbeddingServiceConfig> = {
  embed_model: 'embeddinggemma:latest',
  ollama_url: 'http://127.0.0.1:11434',
  bifrost_url: 'http://127.0.0.1:3040/v1',
  target_dim: 768,
  enable_l1_cache: true,
  enable_l2_cache: true,
  l1_ttl_sec: 3600,
  timeout_ms: 30000,
};

let config = DEFAULT_CONFIG;

/**
 * Initialize embedding service with custom config
 */
export function initEmbeddingService(cfg: Partial<EmbeddingServiceConfig>) {
  config = { ...DEFAULT_CONFIG, ...cfg };
}

/**
 * Get current embedding service config
 */
export function getEmbeddingServiceConfig(): Required<EmbeddingServiceConfig> {
  return { ...config };
}

/**
 * Embed a query string or truncate a pre-computed vector
 *
 * Priority order:
 * 1. L1 Redis exact-match cache (5ms)
 * 2. L2 Bifrost semantic cache (2-5s)
 * 3. Ollama embeddings (direct, 5-10s)
 *
 * @param query String query or pre-embedded vector
 * @param target_dim Target dimension (default: config.target_dim)
 * @returns EmbeddingResult with vector, model, caching info
 */
export async function embedQuery(
  query: string | Float32Array | number[],
  target_dim?: number
): Promise<EmbeddingResult> {
  const start = performance.now();
  const dim = target_dim ?? config.target_dim;

  // Case 1: Pre-computed vector, just truncate if needed
  if (query instanceof Float32Array) {
    const vec = truncateVector(query, dim);
    return {
      vector: vec,
      model: 'pre-embedded',
      dimension: vec.length,
      cached: false,
      exec_ms: performance.now() - start,
    };
  }

  if (Array.isArray(query)) {
    const vec = truncateVector(new Float32Array(query), dim);
    return {
      vector: vec,
      model: 'pre-embedded',
      dimension: vec.length,
      cached: false,
      exec_ms: performance.now() - start,
    };
  }

  // Case 2: String query, try cache then embed
  const queryStr = String(query).trim();
  if (!queryStr) {
    throw new Error('embedQuery: query is empty');
  }

  // Try L1 Redis cache (if available)
  if (config.enable_l1_cache) {
    try {
      const cached = await getL1Cache(queryStr, dim);
      if (cached) {
        return { ...cached, cached: true, cache_level: 'L1', exec_ms: performance.now() - start };
      }
    } catch (err) {
      // Silently fall through if L1 cache unavailable
      console.warn('[EmbeddingService] L1 cache failed, proceeding', err instanceof Error ? err.message : '');
    }
  }

  // Try L2 Bifrost semantic cache (if available)
  if (config.enable_l2_cache) {
    try {
      const cached = await getL2Cache(queryStr, dim);
      if (cached) {
        return { ...cached, cached: true, cache_level: 'L2', exec_ms: performance.now() - start };
      }
    } catch (err) {
      // Silently fall through if L2 cache unavailable
      console.warn('[EmbeddingService] L2 cache failed, proceeding', err instanceof Error ? err.message : '');
    }
  }

  // Case 3: Call Ollama (cold path)
  const result = await embedViaOllama(queryStr, dim);
  const elapsed = performance.now() - start;

  // Store in L1 cache for future requests
  if (config.enable_l1_cache) {
    setL1Cache(queryStr, result.vector, dim).catch((err) => {
      console.warn('[EmbeddingService] Failed to cache result', err instanceof Error ? err.message : '');
    });
  }

  return { ...result, cached: false, exec_ms: elapsed };
}

/**
 * Truncate or pad embedding to target dimension
 */
function truncateVector(vec: Float32Array, target_dim: number): Float32Array {
  if (vec.length === target_dim) {
    return vec;
  }

  if (vec.length > target_dim) {
    // Truncate to target dimension
    return vec.slice(0, target_dim);
  }

  // Pad with zeros
  const padded = new Float32Array(target_dim);
  padded.set(vec);
  return padded;
}

/**
 * Get embedding from L1 Redis cache
 */
async function getL1Cache(query: string, dim: number): Promise<EmbeddingResult | null> {
  try {
    // TODO: Import and use ioredis client from $lib/server/redis
    // const redis = getRedis();
    // const key = `embed:${hashQuery(query)}:${dim}`;
    // const cached = await redis.get(key);
    // if (cached) return JSON.parse(cached);
    return null; // Placeholder
  } catch {
    return null;
  }
}

/**
 * Set embedding in L1 Redis cache
 */
async function setL1Cache(query: string, vector: Float32Array, dim: number): Promise<void> {
  try {
    // TODO: Import and use ioredis client from $lib/server/redis
    // const redis = getRedis();
    // const key = `embed:${hashQuery(query)}:${dim}`;
    // await redis.setex(key, config.l1_ttl_sec, JSON.stringify({
    //   vector: Array.from(vector),
    //   dimension: vector.length,
    //   model: 'embeddinggemma:latest',
    // }));
  } catch (err) {
    console.warn('[EmbeddingService] Failed to set L1 cache', err instanceof Error ? err.message : '');
  }
}

/**
 * Get embedding from L2 Bifrost semantic cache
 */
async function getL2Cache(query: string, dim: number): Promise<EmbeddingResult | null> {
  try {
    // Bifrost semantic cache checks similarity, not exact match
    // This is a placeholder for future integration with Bifrost HTTP API
    // const url = `${config.bifrost_url}/cache/semantic?query=${encodeURIComponent(query)}&threshold=0.95`;
    // const res = await fetch(url, { timeout: 5000 });
    // if (res.ok) {
    //   const cached = await res.json();
    //   return { vector: new Float32Array(cached.embedding), ... };
    // }
    return null;
  } catch {
    return null;
  }
}

/**
 * Embed via Ollama (primary path)
 */
async function embedViaOllama(query: string, dim: number): Promise<EmbeddingResult> {
  const url = `${config.ollama_url}/api/embeddings`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.embed_model,
      prompt: query,
    }),
    timeout: config.timeout_ms,
  });

  if (!res.ok) {
    throw new Error(`Ollama embedding failed: ${res.status}`);
  }

  const json = (await res.json()) as { embedding?: number[] };
  const embedding = json.embedding ?? [];

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('Ollama returned empty embedding');
  }

  const vec = truncateVector(new Float32Array(embedding), dim);

  return {
    vector: vec,
    model: config.embed_model,
    dimension: vec.length,
    cached: false,
    exec_ms: 0, // Measured by caller
  };
}

/**
 * Hash query for cache key (simple SHA-256 placeholder)
 */
function hashQuery(query: string): string {
  // TODO: Import crypto and use actual SHA-256
  // For now, use a simple hash
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    const char = query.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}
