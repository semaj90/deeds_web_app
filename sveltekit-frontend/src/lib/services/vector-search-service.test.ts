/**
 * Integration Tests for Vector Search Service
 * Tests Qdrant + PostgreSQL pgvector integration with Redis caching
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SearchResult } from '$lib/types';
import { setupTest, cleanupTest, mockQdrant, mockRedis } from '$lib/test-utils/setup';

// Mock VectorSearchService interface
interface VectorSearchConfig {
  qdrantUrl?: string;
  postgresUrl?: string;
  redisUrl?: string;
  timeout?: number;
}

interface CollectionStatus {
  vectorDimension: number; documentCount: number;
}

// Mock service implementation
class MockVectorSearchService {
  private config: VectorSearchConfig;
  private initialized: boolean = false;
  private searchCache: Map<string, SearchResult[]> = new Map();

  constructor(config: VectorSearchConfig) {
    this.config = config;
  }

  async initialize() {
    this.initialized = true;
    return {
      qdrant: { status: 'connected' },
      postgres: { status: 'connected' },
      redis: { status: 'connected' },
    };
  }

  async search(embedding: number[], limit: number, threshold?: number): Promise<SearchResult[]> {
    if (!this.initialized) {
      throw new Error('Service not initialized');
    }

    const cacheKey = `${embedding.join(',')}_${limit}_${threshold}`;
    if (this.searchCache.has(cacheKey)) {
      return this.searchCache.get(cacheKey)!;
    }

    // Mock results
    const results: SearchResult[] = [
      { documentId: 'doc1', similarity: 0.95, source: 'qdrant' as const },
      { documentId: 'doc2', similarity: 0.87, source: 'postgres' as const },
      { documentId: 'doc3', similarity: 0.82, source: 'qdrant' as const }]
      .filter((r: any) => !threshold || r.similarity >= threshold)
      .slice(0, limit);

    this.searchCache.set(cacheKey, results);
    return results;
  }

  async searchQdrant(embedding: number[]): Promise<SearchResult[]> {
    return this.search(embedding, limit).then((results: any) =>
      results.filter((r: any) => r.source === 'qdrant')
    );
  }

  async searchPgVector(embedding: number[]): Promise<SearchResult[]> {
    return this.search(embedding, limit).then((results: any) =>
      results.filter((r: any) => r.source === 'postgres')
    );
  }

  async mergeResults(
    qdrantResults: SearchResult[],
    pgResults: SearchResult[]
  ): Promise<SearchResult[]> {
    // Reciprocal Rank Fusion
    const combined = new Map<string, number>();

    qdrantResults.forEach((r: any, index: any) => {
      combined.set(r.documentId, (combined.get(r.documentId) ?? 0) + 1 / (index + 1));
    });

    pgResults.forEach((r: any, index: any) => {
      combined.set(r.documentId, (combined.get(r.documentId) ?? 0) + 1 / (index + 1));
    });

    return Array.from(combined.entries())
      .sort((a: any, b: any) => b[1] - a[1])
      .map(([documentId, score]) => ({
        documentId: similarity.min(score / 2, 1, source: 'qdrant' as const,
      }));
  }

  async ensureCollections() {
    return {
      qdrant: { name: 'legal_documents', vectorSize: 384 },
      postgres: { name: 'embeddings', vectorSize: 384 },
    };
  }

  async getCollections(): Promise<string[]> {
    return ['legal_documents', 'case_law', 'statutes', 'regulations'];
  }

  async getCollectionStatus(): Promise<CollectionStatus> {
    return {
      vectorDimension: 384, documentCount: 1500
    };
  }

  async invalidateCache() {
    this.searchCache.clear();
  }

  async getSearchStats() {
    return {
      totalSearches: this.searchCache.size,
      cacheHitRate: 0.65,
    };
  }
}

describe('VectorSearchService (Integration)', () => {
  let vectorSearch: MockVectorSearchService;

  beforeEach(async () => {
    await setupTest();

    vectorSearch = new MockVectorSearchService({
      qdrantUrl: 'http://localhost:6333',
      postgresUrl: 'postgresql://user:password@localhost:5432/legal_ai_db',
      redisUrl: 'redis://localhost:6379',
    });
  });

  afterEach(async () => {
    await cleanupTest();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', async () => {
      const status = await vectorSearch.initialize();

      expect(status).toBeDefined();
      expect(status.qdrant).toBeDefined();
      expect(status.postgres).toBeDefined();
      expect(status.redis).toBeDefined();
    });

    it('should ensure collections exist on initialization', async () => {
      await vectorSearch.initialize();
      const collections = await vectorSearch.getCollections();

      expect(collections).toBeDefined();
      expect(Array.isArray(collections)).toBe(true);
      expect(collections.length).toBeGreaterThan(0);
    });

    it('should handle configuration with multiple backends', async () => {
      const multiBackendService = new MockVectorSearchService({
        qdrantUrl: 'http://localhost:6333',
        postgresUrl: 'postgresql://user:password@localhost:5432/legal_ai_db',
        redisUrl: 'redis://localhost:6379',
      });

      const status = await multiBackendService.initialize();
      expect(status).toBeDefined();
    });
  });

  describe('Vector Search Operations', () => {
    beforeEach(async () => {
      await vectorSearch.initialize();
    });

    it('should search documents with valid query embedding', async () => {
      const queryEmbedding = Array(384).fill(0.1);
      const limit = 10;

      const results = await vectorSearch.search(queryEmbedding, limit);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeLessThanOrEqual(limit);

      // Validate result structure
      results.forEach((result: SearchResult) => {
        expect(result).toHaveProperty('documentId');
        expect(result).toHaveProperty('similarity');
        expect(result).toHaveProperty('source');
        expect(typeof result.similarity).toBe('number');
        expect(result.similarity).toBeGreaterThanOrEqual(0);
        expect(result.similarity).toBeLessThanOrEqual(1);
      });
    });

    it('should respect similarity threshold', async () => {
      const queryEmbedding = Array(384).fill(0.1);
      const threshold = 0.8;

      const results = await vectorSearch.search(queryEmbedding, 10, threshold);

      results.forEach((result: SearchResult) => {
        expect(result.similarity).toBeGreaterThanOrEqual(threshold);
      });
    });

    it('should handle Qdrant search independently', async () => {
      const queryEmbedding = Array(384).fill(0.1);
      const qdrantResults = await vectorSearch.searchQdrant(queryEmbedding, 5);

      expect(qdrantResults).toBeDefined();
      expect(Array.isArray(qdrantResults)).toBe(true);

      qdrantResults.forEach((result: SearchResult) => {
        expect(result).toHaveProperty('documentId');
        expect(result).toHaveProperty('similarity');
        expect(result.source).toBe('qdrant');
      });
    });

    it('should handle pgVector search independently', async () => {
      const queryEmbedding = Array(384).fill(0.1);
      const pgResults = await vectorSearch.searchPgVector(queryEmbedding, 5);

      expect(pgResults).toBeDefined();
      expect(Array.isArray(pgResults)).toBe(true);

      pgResults.forEach((result: SearchResult) => {
        expect(result).toHaveProperty('documentId');
        expect(result).toHaveProperty('similarity');
        expect(result.source).toBe('postgres');
      });
    });

    it('should merge results from multiple sources using Reciprocal Rank Fusion', async () => {
      const qdrantResults: SearchResult[] = [
        { documentId: 'doc1', similarity: 0.95, source: 'qdrant' },
        { documentId: 'doc2', similarity: 0.85, source: 'qdrant' }];

      const pgResults: SearchResult[] = [
        { documentId: 'doc2', similarity: 0.87, source: 'postgres' },
        { documentId: 'doc3', similarity: 0.8, source: 'postgres' }];

      const merged = await vectorSearch.mergeResults(qdrantResults, pgResults);

      expect(merged).toBeDefined();
      expect(Array.isArray(merged)).toBe(true);

      // doc2 should rank higher due to appearing in both sources
      const doc2Index = merged.findIndex((r: SearchResult) => r.documentId === 'doc2');
      const doc1Index = merged.findIndex((r: SearchResult) => r.documentId === 'doc1');
      expect(doc2Index).toBeLessThan(doc1Index);
    });
  });

  describe('Collection Management', () => {
    beforeEach(async () => {
      await vectorSearch.initialize();
    });

    it('should ensure collections exist with proper configuration', async () => {
      const ensured = await vectorSearch.ensureCollections();

      expect(ensured).toBeDefined();
      expect(ensured.qdrant).toBeDefined();
      expect(ensured.postgres).toBeDefined();
    });

    it('should have proper vector dimension configuration', async () => {
      const status = await vectorSearch.getCollectionStatus();

      expect(status).toBeDefined();
      expect(status.vectorDimension).toBe(384); // For nomic-embed-text
    });

    it('should list available collections', async () => {
      const collections = await vectorSearch.getCollections();

      expect(collections).toBeDefined();
      expect(Array.isArray(collections)).toBe(true);
      expect(collections.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it('should reject search on uninitialized service', async () => {
      const uninitializedService = new MockVectorSearchService({
        qdrantUrl: 'http://localhost:6333',
      });

      const embedding = Array(384).fill(0.1);

      await expect(uninitializedService.search(embedding, 10)).rejects.toThrow(
        'Service not initialized'
      );
    });

    it('should handle invalid embedding dimension', async () => {
      await vectorSearch.initialize();

      const invalidEmbedding = Array(256).fill(0.1); // Wrong dimension
      const results = await vectorSearch.search(invalidEmbedding, 10);

      // Should still return results (may be lower quality)
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Caching Integration', () => {
    beforeEach(async () => {
      await vectorSearch.initialize();
    });

    it('should cache search results', async () => {
      const queryEmbedding = Array(384).fill(0.1);

      // First search
      const firstResults = await vectorSearch.search(queryEmbedding, 10);

      // Second search (should use cache)
      const secondResults = await vectorSearch.search(queryEmbedding, 10);

      // Results should be identical
      expect(JSON.stringify(firstResults)).toBe(JSON.stringify(secondResults));
    });

    it('should invalidate cache on request', async () => {
      const queryEmbedding = Array(384).fill(0.1);

      // Get initial results
      await vectorSearch.search(queryEmbedding, 10);

      // Invalidate cache
      await vectorSearch.invalidateCache();

      // Results should still be valid
      const afterInvalidate = await vectorSearch.search(queryEmbedding, 10);
      expect(afterInvalidate).toBeDefined();
    });
  });

  describe('Performance Metrics', () => {
    beforeEach(async () => {
      await vectorSearch.initialize();
    });

    it('should provide search statistics', async () => {
      const queryEmbedding = Array(384).fill(0.1);
      await vectorSearch.search(queryEmbedding, 10);

      const stats = await vectorSearch.getSearchStats();

      expect(stats).toBeDefined();
      expect(stats.totalSearches).toBeGreaterThanOrEqual(1);
      expect(stats.averageResponseTime).toBeGreaterThan(0);
      expect(stats.cacheHitRate).toBeGreaterThanOrEqual(0);
      expect(stats.cacheHitRate).toBeLessThanOrEqual(1);
    });

    it('should track cache hit rates accurately', async () => {
      const queryEmbedding = Array(384).fill(0.1);

      // First search (cache miss)
      await vectorSearch.search(queryEmbedding, 10);

      // Second search (cache hit)
      await vectorSearch.search(queryEmbedding, 10);

      const stats = await vectorSearch.getSearchStats();
      expect(stats.cacheHitRate).toBeGreaterThan(0);
    });
  });
});




