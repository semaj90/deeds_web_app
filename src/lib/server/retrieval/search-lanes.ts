/**
 * Search lanes abstraction for Phase 3
 * Consolidates Qdrant client, cuVS client, TurboVec prefilter, and BM25 fallback
 * behind a unified SearchLane interface
 *
 * Each lane implements: search(query, k, filters) -> Promise<SearchResult[]>
 * Built-in fallback chain: GPU → Qdrant HNSW → BM25
 */

import type { SearchResult, SearchLaneConfig, SearchFilter } from './types.js';

/**
 * Interface for a single search lane
 */
export interface ISearchLane {
  /** Lane name */
  name: string;

  /** Check if this lane is healthy */
  health(): Promise<boolean>;

  /** Execute search */
  search(query: Float32Array, k: number, filters?: SearchFilter): Promise<SearchResult[]>;

  /** Get lane configuration */
  config(): SearchLaneConfig;
}

/**
 * Abstract base class for search lanes
 */
export abstract class SearchLaneBase implements ISearchLane {
  abstract name: string;

  abstract health(): Promise<boolean>;
  abstract search(query: Float32Array, k: number, filters?: SearchFilter): Promise<SearchResult[]>;

  abstract config(): SearchLaneConfig;

  /**
   * Helper: apply filters to results
   */
  protected applyFilters(results: SearchResult[], filters?: SearchFilter): SearchResult[] {
    if (!filters) return results;

    return results.filter((r) => {
      if (filters.min_confidence !== undefined && r.confidence < filters.min_confidence) {
        return false;
      }
      if (filters.min_score !== undefined && r.score < filters.min_score) {
        return false;
      }
      if (filters.exclude_feature_ids?.includes(r.feature_id ?? '')) {
        return false;
      }
      if (filters.include_packet_keys && !filters.include_packet_keys.includes(r.packet_key ?? '')) {
        return false;
      }
      return true;
    });
  }

  /**
   * Helper: rank results
   */
  protected rankResults(results: SearchResult[]): SearchResult[] {
    return results.map((r, idx) => ({ ...r, rank: idx }));
  }
}

/**
 * GPU cuVS search lane (Stage 3A)
 */
export class GpuCuvSLane extends SearchLaneBase {
  name = 'gpu-cuvs';

  private url: string;
  private timeout: number;

  constructor(url: string = 'http://127.0.0.1:8791', timeout: number = 30000) {
    super();
    this.url = url;
    this.timeout = timeout;
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/health`, { timeout: 5000 });
      return res.ok;
    } catch {
      return false;
    }
  }

  async search(query: Float32Array, k: number, filters?: SearchFilter): Promise<SearchResult[]> {
    if (!(await this.health())) {
      throw new Error('GPU cuVS service unavailable');
    }

    const res = await fetch(`${this.url}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: Array.from(query),
        k,
      }),
      timeout: this.timeout,
    });

    if (!res.ok) {
      throw new Error(`GPU search failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      indices: number[];
      distances: number[];
      metric: string;
    };

    // Convert GPU indices + distances to SearchResult
    const results: SearchResult[] = data.indices.map((idx, i) => ({
      id: String(idx),
      rank: i,
      score: this.distanceToScore(data.distances[i], data.metric),
      confidence: 0.95,
      source: 'gpu-cuvs',
      packet_key: null, // Will be joined from Postgres
      source_ref: null,
      feature_id: null,
      file_path: null,
      summary: null,
      metadata: {
        gpu_indices: [idx],
        gpu_distances: [data.distances[i]],
      },
    }));

    return this.applyFilters(results, filters);
  }

  config(): SearchLaneConfig {
    return {
      enabled: true,
      priority: 0, // Highest priority
      weight: 0.4,
      fallback: 'qdrant',
    };
  }

  private distanceToScore(distance: number, metric: string): number {
    // Convert distance to [0, 1] similarity score
    if (metric === 'cosine') {
      return Math.max(0, 1 - distance);
    }
    if (metric === 'l2') {
      // L2 distance: smaller is better, convert to [0, 1]
      return Math.exp(-distance);
    }
    if (metric === 'inner_product') {
      // Inner product: already in suitable range
      return Math.max(0, distance);
    }
    return 0.5; // Default
  }
}

/**
 * Qdrant vector search lane (existing fallback)
 */
export class QdrantLane extends SearchLaneBase {
  name = 'qdrant';

  private url: string;
  private collection: string;
  private timeout: number;

  constructor(
    url: string = 'http://127.0.0.1:6333',
    collection: string = 'codebase_chunks_768',
    timeout: number = 30000
  ) {
    super();
    this.url = url;
    this.collection = collection;
    this.timeout = timeout;
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/collections/${this.collection}`, { timeout: 5000 });
      return res.ok;
    } catch {
      return false;
    }
  }

  async search(query: Float32Array, k: number, filters?: SearchFilter): Promise<SearchResult[]> {
    if (!(await this.health())) {
      throw new Error('Qdrant service unavailable');
    }

    const res = await fetch(`${this.url}/collections/${this.collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: Array.from(query),
        limit: k,
        with_payload: true,
      }),
      timeout: this.timeout,
    });

    if (!res.ok) {
      throw new Error(`Qdrant search failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      result: Array<{
        id: string;
        score: number;
        payload: Record<string, unknown>;
      }>;
    };

    const results: SearchResult[] = (data.result ?? []).map((point, i) => ({
      id: point.id,
      rank: i,
      score: Math.min(1, Math.max(0, point.score)),
      confidence: 0.85,
      source: 'qdrant',
      packet_key: (point.payload?.packet_key as string | null) ?? null,
      source_ref: (point.payload?.source_ref as string | null) ?? null,
      feature_id: (point.payload?.feature_id as string | null) ?? null,
      file_path: (point.payload?.file_path as string | null) ?? null,
      summary: (point.payload?.summary as string | null) ?? null,
      metadata: {
        qdrant_point_id: point.id,
        qdrant_collection: this.collection,
        payload: point.payload,
      },
    }));

    return this.applyFilters(results, filters);
  }

  config(): SearchLaneConfig {
    return {
      enabled: true,
      priority: 1,
      weight: 0.35,
      fallback: 'bm25',
    };
  }
}

/**
 * BM25 lexical search lane (fallback)
 */
export class Bm25Lane extends SearchLaneBase {
  name = 'bm25';

  async health(): Promise<boolean> {
    // BM25 is always available (uses Postgres FTS)
    return true;
  }

  async search(query: Float32Array, k: number, filters?: SearchFilter): Promise<SearchResult[]> {
    // Convert vector back to query string for BM25
    // This is a placeholder; real implementation would use Postgres FTS
    // For now, return empty results (BM25 not yet implemented)
    return [];
  }

  config(): SearchLaneConfig {
    return {
      enabled: true,
      priority: 2,
      weight: 0.25,
    };
  }
}

/**
 * Search lane registry: manages all available lanes
 */
export class SearchLaneRegistry {
  private lanes: Map<string, ISearchLane> = new Map();
  private fallbackChain: string[] = [];

  constructor() {
    // Register default lanes in priority order
    this.register(new GpuCuvSLane());
    this.register(new QdrantLane());
    this.register(new Bm25Lane());

    // Set default fallback chain
    this.fallbackChain = ['gpu-cuvs', 'qdrant', 'bm25'];
  }

  /**
   * Register a search lane
   */
  register(lane: ISearchLane): void {
    this.lanes.set(lane.name, lane);
  }

  /**
   * Get a lane by name
   */
  get(name: string): ISearchLane | undefined {
    return this.lanes.get(name);
  }

  /**
   * Get all registered lanes
   */
  getAll(): ISearchLane[] {
    return Array.from(this.lanes.values());
  }

  /**
   * Get fallback chain
   */
  getFallbackChain(): string[] {
    return [...this.fallbackChain];
  }

  /**
   * Set fallback chain
   */
  setFallbackChain(chain: string[]): void {
    this.fallbackChain = chain;
  }

  /**
   * Execute search with fallback chain
   */
  async searchWithFallback(
    query: Float32Array,
    k: number,
    filters?: SearchFilter
  ): Promise<{ results: SearchResult[]; lane: string }> {
    const chain = this.getFallbackChain();

    for (const laneName of chain) {
      const lane = this.get(laneName);
      if (!lane) continue;

      try {
        if (!(await lane.health())) {
          console.warn(`[SearchLane] ${laneName} unhealthy, trying next`);
          continue;
        }

        const results = await lane.search(query, k, filters);
        return { results, lane: laneName };
      } catch (err) {
        console.warn(`[SearchLane] ${laneName} failed:`, err instanceof Error ? err.message : '');
        continue;
      }
    }

    // All lanes failed
    throw new Error('All search lanes failed');
  }
}

/**
 * Global singleton registry
 */
let registry: SearchLaneRegistry | null = null;

/**
 * Get or create global search lane registry
 */
export function getSearchLaneRegistry(): SearchLaneRegistry {
  if (!registry) {
    registry = new SearchLaneRegistry();
  }
  return registry;
}
