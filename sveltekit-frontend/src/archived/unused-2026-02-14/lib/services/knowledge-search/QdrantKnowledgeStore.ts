/**
 * Qdrant Knowledge Store
 * Phase 76 - Task 4.1: QdrantKnowledgeStore class
 *
 * Provides vector storage and semantic search using Qdrant.
 * Uses 768-dimensional embeddings from embeddinggemma:latest.
 *
 * Requirements: 1.1: 1.3
 *
 * Property 2: Search Results Ordering
 * Property 3: Search Result Schema Completeness
 */

import type { SearchResult, SearchOptions,
  SearchFilters, CollectionStats, FullDocument } from './types.js';

export interface QdrantConfig {
  url: string;
  collection: string;
  apiKey?: string;
}

export interface QdrantPoint {
  id: number;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface QdrantSearchResult {
  id: number;
  score: number;
  payload: Record<string, unknown>;
}

const DEFAULT_CONFIG: QdrantConfig = {
  url: process.env?.QDRANT_URL ?? 'http://localhost:6333',
  collection: 'phase76_knowledge_base'
};

/**
 * Qdrant Knowledge Store
 * Handles vector storage and semantic search operations
 */
export class QdrantKnowledgeStore {
  private config: QdrantConfig;
  private initialized: boolean = false;

  constructor(config?: Partial<QdrantConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the collection if it doesn't exist
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const response = await fetch(
        `${this.config.url}/collections/${this.config.collection}`,
        { headers: this.getHeaders() }
      );

      if (response.status === 404) {
        await this.createCollection();
      }

      this.initialized = true;
      console.log(`✅ Qdrant collection "${this.config.collection}" ready`);
    } catch (error) {
      console.error('❌ Failed to initialize Qdrant:', error);
      throw error;
    }
  }

  /**
   * Create the collection with proper configuration
   */
  private async createCollection(): Promise<void> {
    const response = await fetch(
      `${this.config.url}/collections/${this.config.collection}`,
      {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({
          vectors: {
            size: 768,
            distance: 'Cosine'
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create collection: ${response.status}`);
    }

    console.log(`📦 Created Qdrant collection: ${this.config.collection}`);
  }

  /**
   * Upsert a document with its embedding
   * Requirements: 1.1
   */
  async upsertDocument(
    id: number,
    embedding: number[],
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.initialize();

    if (embedding.length !== 768) {
      throw new Error(`Invalid embedding dimension: ${embedding.length}, expected 768`);
    }

    const response = await fetch(
      `${this.config.url}/collections/${this.config.collection}/points`,
      {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({
          points: [{ id, vector: embedding, payload }]
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Qdrant upsert failed: ${error}`);
    }
  }

  /**
   * Batch upsert multiple documents
   */
  async upsertBatch(points: QdrantPoint[]): Promise<void> {
    await this.initialize();

    for (const point of points) {
      if (point.vector.length !== 768) {
        throw new Error(`Invalid embedding dimension for point ${point.id}`);
      }
    }

    const response = await fetch(
      `${this.config.url}/collections/${this.config.collection}/points`,
      {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({ points })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Qdrant batch upsert failed: ${error}`);
    }
  }

  /**
   * Search for similar documents using cosine similarity
   * Requirements: 1.2, 1.3
   *
   * Property 2: Results are sorted by score in descending order
   */
  async search(
    queryEmbedding: number[] | string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    await this.initialize();

    const { topK = 10, threshold = 0.5, filters } = options;

    // Handle string queries by returning empty (caller should embed first)
    if (typeof queryEmbedding === 'string') {
      console.warn('Qdrant search received string query - caller should embed first');
      return [];
    }

    if (queryEmbedding.length !== 768) {
      throw new Error(`Invalid query embedding dimension: ${queryEmbedding.length}`);
    }

    const qdrantFilter = this.buildFilter(filters);

    const response = await fetch(
      `${this.config.url}/collections/${this.config.collection}/points/search`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          vector: queryEmbedding,
          limit: topK,
          score_threshold: threshold,
          with_payload: true,
          filter: qdrantFilter
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Qdrant search failed: ${error}`);
    }

    const data = await response.json();
    const results: QdrantSearchResult[] = data?.result || [];

    return results.map((r: any) => this.mapToSearchResult(r));
  }

  /**
   * Get a document by ID
   * Requirements: 1.3
   */
  async getDocument(id: number | string): Promise<any | null> {
    await this.initialize();

    const response = await fetch(
      `${this.config.url}/collections/${this.config.collection}/points/${id}`,
      { headers: this.getHeaders() }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Qdrant get failed: ${error}`);
    }

    const data = await response.json();
    const point = data.result;

    if (!point) return null;

    return point;
  }

  /**
   * Delete a document by ID
   */
  async deleteDocument(id: number): Promise<boolean> {
    await this.initialize();

    const response = await fetch(
      `${this.config.url}/collections/${this.config.collection}/points/delete`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          points: [id]
        })
      }
    );

    return response.ok;
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<{ points: number; status: string }> {
    await this.initialize();

    const response = await fetch(
      `${this.config.url}/collections/${this.config.collection}`,
      { headers: this.getHeaders() }
    );

    if (!response.ok) {
      return { points: 0, status: 'error' };
    }

    const data = await response.json();
    const info = data.result;

    return {
      points: info?.points_count ?? 0,
      status: info?.status ?? 'unknown'
    };
  }

  /**
   * Scroll through all documents (for reindexing)
   */
  async scrollAll(
    limit: number = 100,
    offset?: number
  ): Promise<{ points: QdrantPoint[]; nextOffset?: number }> {
    await this.initialize();

    const response = await fetch(
      `${this.config.url}/collections/${this.config.collection}/points/scroll`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          limit,
          offset,
          with_vector: true
        })
      }
    );

    if (!response.ok) {
      return { points: [] };
    }

    const data = await response.json();
    return {
      points: data.result?.points ?? [],
      nextOffset: data.result?.next_page_offset
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['api-key'] = this.config.apiKey;
    }

    return headers;
  }

  /**
   * Build Qdrant filter from SearchFilters
   */
  private buildFilter(filters?: SearchFilters): Record<string, unknown> | undefined {
    if (!filters) return undefined;

    const must: Record<string, unknown>[] = [];

    if (filters?.tags && filters.tags.length > 0) {
      for (const tag of filters.tags) {
        must.push({
          key: 'tags',
          match: { value: tag }
        });
      }
    }

    if (filters.source) {
      must.push({
        key: 'source',
        match: { value: filters.source }
      });
    }

    if (filters.dateRange) {
      if (filters.dateRange.start) {
        must.push({
          key: 'scrapedAt',
          range: { gte: filters.dateRange.start.toISOString() }
        });
      }
      if (filters.dateRange.end) {
        must.push({
          key: 'scrapedAt',
          range: { lte: filters.dateRange.end.toISOString() }
        });
      }
    }

    if (filters.urlPattern) {
      must.push({
        key: 'url',
        match: { text: filters.urlPattern }
      });
    }

    return must.length > 0 ? { must } : undefined;
  }

  /**
   * Map Qdrant search result to SearchResult
   * Property 3: Ensures all required fields are present
   */
  private mapToSearchResult(result: QdrantSearchResult): SearchResult {
    const payload = result?.payload || {};

    return {
      id: String(result.id),
      title: String(payload?.title ?? 'Untitled'),
      url: String(payload?.url ?? ''),
      summary: String(payload?.summary ?? ''),
      tags: Array.isArray(payload.tags) ? payload.tags as string[] : [],
      scores: {
        semantic: result.score,
        tfidf: 0,
        combined: result.score
      },
      snippet: payload.summary ? String(payload.summary).slice(0, 200) : undefined
    };
  }

  /**
   * Map Qdrant point to FullDocument
   */
  private mapToFullDocument(point: {
    id: number;
    payload: Record<string, unknown>;
  }): FullDocument {
    const payload = point?.payload || {};

    return {
      id: String(point.id),
      title: String(payload?.title ?? 'Untitled'),
      url: String(payload?.url ?? ''),
      content: String(payload?.content ?? ''),
      summary: String(payload?.summary ?? ''),
      entities: Array.isArray(payload.entities)
        ? payload.entities as string[]
        : String(payload?.entities ?? '').split(',').filter(Boolean),
      tags: Array.isArray(payload.tags) ? payload.tags as string[] : [],
      scrapedAt: new Date(String(payload?.scrapedAt || new Date().toISOString())),
      minioKey: String(payload?.minioKey ?? '')
    };
  }
}

/**
 * Singleton instance
 */
let qdrantStoreInstance: QdrantKnowledgeStore | null = null;

/**
 * Get or create QdrantKnowledgeStore singleton
 */
export function getQdrantKnowledgeStore(config?: Partial<QdrantConfig>): QdrantKnowledgeStore {
  if (!qdrantStoreInstance) {
    qdrantStoreInstance = new QdrantKnowledgeStore(config);
  }
  return qdrantStoreInstance;
}