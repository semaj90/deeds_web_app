/**
 * Smoke test for Redis Cache Consolidation utilities
 * Verifies all 5 unified utilities are syntactically correct and export expected APIs
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as sharedApi from '$lib/server/cache/shared-cache-api';
import * as cacheConfig from '$lib/server/cache/cache-config';
import * as embeddingCache from '$lib/server/cache/embedding-cache-unified';
import * as authorityScorer from '$lib/server/cache/authority-scorer-unified';
import * as timelineBuilder from '$lib/server/cache/timeline-builder-unified';
import * as entityExtractor from '$lib/server/cache/entity-extractor-unified';

describe('Redis Cache Consolidation — Smoke Tests', () => {
  describe('1. Shared Cache API', () => {
    it('exports cacheTTL function', () => {
      expect(typeof sharedApi.cacheTTL).toBe('function');
    });

    it('exports cacheHashMap function', () => {
      expect(typeof sharedApi.cacheHashMap).toBe('function');
    });

    it('exports cacheGetBatch function', () => {
      expect(typeof sharedApi.cacheGetBatch).toBe('function');
    });

    it('exports InvalidationRegistry class', () => {
      expect(typeof sharedApi.InvalidationRegistry).toBe('function');
    });

    it('InvalidationRegistry has register method', () => {
      const registry = new sharedApi.InvalidationRegistry();
      expect(typeof registry.register).toBe('function');
      expect(typeof registry.invalidate).toBe('function');
      expect(typeof registry.cascade).toBe('function');
      expect(typeof registry.setDependency).toBe('function');
    });
  });

  describe('2. Cache Config', () => {
    it('exports CACHE_TTL with 9 keys', () => {
      expect(Object.keys(cacheConfig.CACHE_TTL).length).toBeGreaterThanOrEqual(9);
      expect(cacheConfig.CACHE_TTL.EMBEDDING).toBe(7 * 24 * 60 * 60);
      expect(cacheConfig.CACHE_TTL.AUTHORITY).toBe(24 * 60 * 60);
    });

    it('exports CACHE_KEYS with 8 functions', () => {
      expect(Object.keys(cacheConfig.CACHE_KEYS).length).toBeGreaterThanOrEqual(8);
      expect(typeof cacheConfig.CACHE_KEYS.EMBEDDING).toBe('function');
      expect(typeof cacheConfig.CACHE_KEYS.AUTHORITY_BLEND).toBe('function');
      expect(typeof cacheConfig.CACHE_KEYS.CASE_TIMELINE).toBe('function');
      expect(typeof cacheConfig.CACHE_KEYS.ENTITIES).toBe('function');
    });

    it('exports Zod schemas', () => {
      expect(cacheConfig.EmbeddingSchema).toBeDefined();
      expect(cacheConfig.AuthorityScoreSchema).toBeDefined();
      expect(cacheConfig.TimelineEventSchema).toBeDefined();
      expect(cacheConfig.EntitySchema).toBeDefined();
      expect(cacheConfig.InvalidationEventSchema).toBeDefined();
      expect(cacheConfig.ACEContextSchema).toBeDefined();
    });

    it('exports CACHE_PRESETS', () => {
      expect(cacheConfig.CACHE_PRESETS.STATIC).toBeDefined();
      expect(cacheConfig.CACHE_PRESETS.USER).toBeDefined();
      expect(cacheConfig.CACHE_PRESETS.HOT).toBeDefined();
      expect(cacheConfig.CACHE_PRESETS.SYSTEM).toBeDefined();
    });
  });

  describe('3. Embedding Cache Unified', () => {
    it('exports getEmbedding function', () => {
      expect(typeof embeddingCache.getEmbedding).toBe('function');
    });

    it('exports cacheEmbedding function', () => {
      expect(typeof embeddingCache.cacheEmbedding).toBe('function');
    });

    it('exports batchCacheEmbeddings function', () => {
      expect(typeof embeddingCache.batchCacheEmbeddings).toBe('function');
    });

    it('exports batchGetCachedEmbeddings function', () => {
      expect(typeof embeddingCache.batchGetCachedEmbeddings).toBe('function');
    });

    it('exports clearEmbeddingCache function', () => {
      expect(typeof embeddingCache.clearEmbeddingCache).toBe('function');
    });

    it('exports hashTextSha256 function', () => {
      expect(typeof embeddingCache.hashTextSha256).toBe('function');
    });

    it('exports hashTextMd5 function', () => {
      expect(typeof embeddingCache.hashTextMd5).toBe('function');
    });
  });

  describe('4. Authority Scorer Unified', () => {
    it('exports getAuthorityBlend function', () => {
      expect(typeof authorityScorer.getAuthorityBlend).toBe('function');
    });

    it('exports getAuthorityBlendBatch function', () => {
      expect(typeof authorityScorer.getAuthorityBlendBatch).toBe('function');
    });

    it('exports getTopAuthorityFiles function', () => {
      expect(typeof authorityScorer.getTopAuthorityFiles).toBe('function');
    });

    it('exports getAuthorityScoreStats function', () => {
      expect(typeof authorityScorer.getAuthorityScoreStats).toBe('function');
    });

    it('exports clearAuthorityCache function', () => {
      expect(typeof authorityScorer.clearAuthorityCache).toBe('function');
    });
  });

  describe('5. Timeline Builder Unified', () => {
    it('exports TimelineBuilder class', () => {
      expect(typeof timelineBuilder.TimelineBuilder).toBe('function');
    });

    it('TimelineBuilder has fluent interface', () => {
      const builder = timelineBuilder.TimelineBuilder.forCase('test-id');
      expect(typeof builder.sinceHours).toBe('function');
      expect(typeof builder.filterEvents).toBe('function');
      expect(typeof builder.execute).toBe('function');
    });

    it('exports convenience functions', () => {
      expect(typeof timelineBuilder.getRecentTimeline).toBe('function');
      expect(typeof timelineBuilder.getTimelineByEvent).toBe('function');
      expect(typeof timelineBuilder.getCitationTimeline).toBe('function');
      expect(typeof timelineBuilder.getUserDwellEvents).toBe('function');
    });

    it('exports cache invalidation functions', () => {
      expect(typeof timelineBuilder.clearTimelineCache).toBe('function');
      expect(typeof timelineBuilder.invalidateTimelineOnEvent).toBe('function');
    });
  });

  describe('6. Entity Extractor Unified', () => {
    it('exports entityExtractor singleton', () => {
      expect(entityExtractor.entityExtractor).toBeDefined();
      expect(typeof entityExtractor.entityExtractor.extract).toBe('function');
      expect(typeof entityExtractor.entityExtractor.register).toBe('function');
      expect(typeof entityExtractor.entityExtractor.useExtractor).toBe('function');
    });

    it('exports extractEntities function', () => {
      expect(typeof entityExtractor.extractEntities).toBe('function');
    });

    it('exports extractEntitiesWithMetadata function', () => {
      expect(typeof entityExtractor.extractEntitiesWithMetadata).toBe('function');
    });

    it('exports clearEntityCache function', () => {
      expect(typeof entityExtractor.clearEntityCache).toBe('function');
    });
  });

  describe('Cache Key Generation', () => {
    it('CACHE_KEYS.EMBEDDING generates correct format', () => {
      const key = cacheConfig.CACHE_KEYS.EMBEDDING('embeddinggemma:latest', 'abc123');
      expect(key).toBe('embed:v2:embeddinggemma:latest:abc123');
    });

    it('CACHE_KEYS.AUTHORITY_BLEND generates correct format', () => {
      const key = cacheConfig.CACHE_KEYS.AUTHORITY_BLEND('file-123');
      expect(key).toBe('authority:blend:file-123');
    });

    it('CACHE_KEYS.CASE_TIMELINE generates correct format', () => {
      const key = cacheConfig.CACHE_KEYS.CASE_TIMELINE('case-456');
      expect(key).toBe('case:timeline:case-456');
    });

    it('CACHE_KEYS.ENTITIES generates correct format', () => {
      const key = cacheConfig.CACHE_KEYS.ENTITIES('hash789');
      expect(key).toBe('entities:hash789');
    });
  });

  describe('Hash Functions', () => {
    it('hashTextSha256 produces consistent hashes', () => {
      const text = 'test-text-for-hashing';
      const hash1 = embeddingCache.hashTextSha256(text);
      const hash2 = embeddingCache.hashTextSha256(text);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex is 64 chars
    });

    it('hashTextMd5 produces consistent hashes', () => {
      const text = 'test-text-for-hashing';
      const hash1 = embeddingCache.hashTextMd5(text);
      const hash2 = embeddingCache.hashTextMd5(text);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(32); // MD5 hex is 32 chars
    });
  });
});
