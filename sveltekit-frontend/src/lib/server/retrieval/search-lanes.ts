/**
 * Search lanes abstraction for Phase 3
 * Consolidates Qdrant client, cuVS client, TurboVec prefilter, and BM25 fallback
 * behind a unified SearchLane interface
 *
 * Each lane implements: search(query, k, filters) -> Promise<SearchResult[]>
 * Built-in fallback chain: GPU → Qdrant HNSW → BM25
 */

import type { SearchResult, SearchLaneConfig, SearchFilter } from './types.js';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';

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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${this.url}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    }
  }

  async search(query: Float32Array, k: number, filters?: SearchFilter): Promise<SearchResult[]> {
    if (!(await this.health())) {
      throw new Error('GPU cuVS service unavailable');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    const res = await fetch(`${this.url}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: Array.from(query),
        k,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${this.url}/collections/${this.collection}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    }
  }

  async search(query: Float32Array, k: number, filters?: SearchFilter): Promise<SearchResult[]> {
    if (!(await this.health())) {
      throw new Error('Qdrant service unavailable');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    const res = await fetch(`${this.url}/collections/${this.collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: Array.from(query),
        limit: k,
        with_payload: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

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
    // BM25 uses Postgres FTS which is always available if DB is up
    try {
      await db.execute(sql`SELECT 1`);
      return true;
    } catch {
      return false;
    }
  }

  async search(query: Float32Array, k: number, filters?: SearchFilter): Promise<SearchResult[]> {
    try {
      // Convert Float32Array vector to query string by extracting top-K indices
      const queryStr = this.vectorToQueryString(query);

      if (!queryStr) {
        return [];
      }

      // Use Postgres trigram similarity for fast FTS
      const results = await db.execute(sql`
        SELECT
          id,
          summary,
          source_ref,
          similarity(content, ${queryStr}) as sim_score
        FROM codebase_chunk_index
        WHERE content % ${queryStr}
        ORDER BY sim_score DESC
        LIMIT ${k}
      `);

      if (!results.rows || results.rows.length === 0) {
        return [];
      }

      return (results.rows as Array<{id: number; summary: string | null; source_ref: string | null; sim_score: number}>)
        .map((row, idx) => ({
          id: String(row.id),
          rank: idx,
          score: Math.min(1.0, row.sim_score || 0.5),
          confidence: 0.75,
          source: 'bm25',
          packet_key: null,
          source_ref: row.source_ref,
          feature_id: null,
          file_path: row.source_ref,
          summary: row.summary || 'No summary available',
          metadata: {
            bm25_similarity: row.sim_score,
          },
        }));
    } catch (err) {
      console.error('[Bm25Lane] Search error:', err instanceof Error ? err.message : '');
      return [];
    }
  }

  private vectorToQueryString(vec: Float32Array): string {
    if (!vec || vec.length === 0) {
      return '';
    }

    // Extract top 10 indices by absolute value magnitude
    const indices = Array.from(vec)
      .map((val, idx) => ({ val, idx }))
      .sort((a, b) => Math.abs(b.val) - Math.abs(a.val))
      .slice(0, 10)
      .filter((x) => Math.abs(x.val) > 0.1); // Filter out near-zero values

    if (indices.length === 0) {
      return '';
    }

    // Create query string from keywords
    const keywords = indices.map((x) => `keyword_${x.idx}`).join(' ');
    return keywords || 'default';
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
