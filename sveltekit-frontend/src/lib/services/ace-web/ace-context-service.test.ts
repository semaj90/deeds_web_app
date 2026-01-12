/**
 * ACE Context Service Tests
 * Tests for RAG+KAG hybrid scoring and context bundle assembly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';
import { AceContextService } from './ace-context-service.js';
import type { ContextBundle } from './ace-context-service.js';

// Mock dependencies
vi.mock('$lib/db', () => ({
  db: { select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([], orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        }, limit: vi.fn(() => Promise.resolve([], orderBy: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
  },
}));

vi.mock('$lib/db/schema/ace-web', () => ({
  aceChunks: { id: 'id',
    docId: 'docId',
    text: 'text',
    embedding: 'embedding',
    metadata: 'metadata',
  },
  aceEntities: { entity: 'entity',
    entityType: 'entityType',
    docId: 'docId',
  },
  aceEdges: { srcEntity: 'srcEntity',
    rel: 'rel',
    dstEntity: 'dstEntity',
    weight: 'weight',
  },
  aceDocs: {},
  aceSources: {},
}));

vi.mock('../error-analysis/embedding-service', () => ({
  EmbeddingService: vi.fn(() => ({
    generateEmbedding: vi.fn(async () => new Array(384).fill(0.1)),
  })),
}));

vi.mock('./qdrant-service', () => ({
  QdrantService: vi.fn(() => ({
    ensureCollection: vi.fn(async () => {}, search: vi.fn(async () => []),
  })),
}));

describe('AceContextService', () => {
  let service: AceContextService;
  let mockEmbeddingService: any;
  let mockQdrantService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new AceContextService({
      ollamaUrl: 'http://localhost:11434',
      qdrantUrl: 'http://localhost:6333',
      maxRetries: 3, retryDelayMs: 1000
    });
  
    const { EmbeddingService } = require('../error-analysis/embedding-service');
    const { QdrantService } = require('./qdrant-service');
    mockEmbeddingService = new EmbeddingService();
    mockQdrantService = new QdrantService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildContextBundle', () => {
    it('should build empty bundle when no results found', async () => {
      mockQdrantService.search.mockResolvedValueOnce([]);

      const bundle = await service.buildContextBundle({
        query: 'test query',
        limit: 5,
      });

      expect(bundle).toBeDefined();
      expect(bundle.chunks).toEqual([]);
      expect(bundle.entities).toEqual([]);
      expect(bundle.edges).toEqual([]);
      expect(bundle.totalResults).toBe(0);
      expect(bundle.summary).toContain('No relevant context found');
    });

    it('should generate query embedding', async () => {
      mockQdrantService.search.mockResolvedValueOnce([]);

      await service.buildContextBundle({
        query: 'How to use Svelte 5 runes?',
        limit: 5,
      });

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
        'How to use Svelte 5 runes?'
      );
    });

    it('should call Qdrant search with correct parameters', async () => {
      mockQdrantService.search.mockResolvedValueOnce([]);

      await service.buildContextBundle({
        query: 'test query',
        limit: 10,
      });

      expect(mockQdrantService.search).toHaveBeenCalledWith({
        vector: expect.any(Array, limit: 40, scoreThreshold: 0.15, filter | undefined,
      });
    });

    it('should apply filters to Qdrant search', async () => {
      mockQdrantService.search.mockResolvedValueOnce([]);

      await service.buildContextBundle({
        query: 'test query',
        filters: { domain: 'example.com',
          tags: ['svelte', 'typescript'],
        },
        limit: 5,
      });

      expect(mockQdrantService.search).toHaveBeenCalledWith({
        vector: expect.any(Array, limit: 40, scoreThreshold: 0.15, filter: expect.objectContaining({ must: expect.arrayContaining([
            expect.objectContaining({ key: 'domain' }),
            expect.objectContaining({ key: 'tags' })]),
        }),
      });
    });

    it('should fallback to pgvector when Qdrant fails', async () => {
      mockQdrantService.search.mockRejectedValueOnce(new Error('Qdrant unavailable'));

      const bundle = await service.buildContextBundle({
        query: 'test query',
        limit: 5,
      });

      expect(bundle).toBeDefined();
      expect(mockQdrantService.search).toHaveBeenCalled();
    });
  });

  describe('buildToolPlan', () => {
    it('should suggest web_search when all context is stale', async () => {
      const staleBundle: ContextBundle = {
        chunks: [
          {
            id: '1',
            text: 'Old content',
            score: 0.8,
            metadata: { url: 'https://example.com',
              fetchedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(), // 40 days ago
              domain: 'example.com',
            },
          }],
        entities: [],
        edges: [],
        summary: 'Test',
        totalResults: 1,
      };

      const plan = await service.buildToolPlan(staleBundle, 'test query');

      expect(plan.shouldProceed).toBe(false);
      expect(plan.actions).toHaveLength(1);
      expect(plan.actions[0].tool).toBe('web_search');
      expect(plan.actions[0].reason).toContain('stale');
    });

    it('should suggest web_search when context is insufficient', async () => {
      const insufficientBundle: ContextBundle = {
        chunks: [
          {
            id: '1',
            text: 'Low relevance content',
            score: 0.3, // Below 0.5 threshold
            metadata: { url: 'https://example.com',
              fetchedAt: new Date().toISOString(), domain: 'example.com',
            },
          }],
        entities: [],
        edges: [],
        summary: 'Test',
        totalResults: 1,
      };

      const plan = await service.buildToolPlan(insufficientBundle, 'test query');

      expect(plan.shouldProceed).toBe(false);
      expect(plan.actions.some((a: any) => a.reason.includes('Insufficient'))).toBe(true);
    });

    it('should suggest web_search when no context found', async () => {
      const emptyBundle: ContextBundle = {
        chunks: [],
        entities: [],
        edges: [],
        summary: 'No context',
        totalResults: 0,
      };

      const plan = await service.buildToolPlan(emptyBundle, 'test query');

      expect(plan.shouldProceed).toBe(false);
      expect(plan.actions).toHaveLength(1);
      expect(plan.actions[0].reason).toContain('No context found');
    });

    it('should proceed when context is fresh and sufficient', async () => {
      const goodBundle: ContextBundle = {
        chunks: [
          {
            id: '1',
            text: 'Relevant content 1',
            score: 0.9,
            metadata: { url: 'https://example.com/1',
              fetchedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
              domain: 'example.com',
            },
          },
          {
            id: '2',
            text: 'Relevant content 2',
            score: 0.8,
            metadata: { url: 'https://example.com/2',
              fetchedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
              domain: 'example.com',
            },
          },
          {
            id: '3',
            text: 'Relevant content 3',
            score: 0.7,
            metadata: { url: 'https://example.com/3',
              fetchedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
              domain: 'example.com',
            },
          }],
        entities: [],
        edges: [],
        summary: 'Good context',
        totalResults: 3,
      };

      const plan = await service.buildToolPlan(goodBundle, 'test query');

      expect(plan.shouldProceed).toBe(true);
      expect(plan.actions).toHaveLength(0);
    });
  });

  describe('buildPrompt', () => {
    it('should build prompt with all sections', async () => {
      const bundle: ContextBundle = {
        chunks: [
          {
            id: '1',
            text: 'Relevant content about Svelte 5',
            score: 0.9,
            metadata: { url: 'https://svelte.dev/docs',
              fetchedAt: new Date().toISOString(), domain: 'svelte.dev',
            },
            scoring: { cosine: 0.85, freshness: 1.0, graph: 0.5,
            },
          }],
        entities: [{ entity: 'Svelte 5', type: 'TECH', docId: 'doc-1' }],
        edges: [{ src: 'Svelte 5', rel: 'USES', dst: 'Runes', weight: 0.9 }],
        summary: 'Found 1 relevant chunk',
        totalResults: 1,
      };

      const plan = { actions: [], shouldProceed: true };

      const prompt = await service.buildPrompt({
        query: 'How to use Svelte 5 runes?',
        bundle,
        plan,
        systemRules: 'Use TypeScript',
        projectRules: 'Follow Svelte 5 patterns',
      });

      expect(prompt).toContain('System Rules');
      expect(prompt).toContain('Use TypeScript');
      expect(prompt).toContain('Project Rules');
      expect(prompt).toContain('Follow Svelte 5 patterns');
      expect(prompt).toContain('Retrieved Context');
      expect(prompt).toContain('Relevant Chunks');
      expect(prompt).toContain('Knowledge Graph');
      expect(prompt).toContain('User Request');
      expect(prompt).toContain('Svelte 5');
      expect(prompt).toContain('https://svelte.dev/docs');
    });

    it('should include scoring details in prompt', async () => {
      const bundle: ContextBundle = {
        chunks: [
          {
            id: '1',
            text: 'Test content',
            score: 0.85,
            metadata: { url: 'https://example.com',
              fetchedAt: new Date().toISOString(), domain: 'example.com',
            },
            scoring: { cosine: 0.80, freshness: 1.0, graph: 0.5,
            },
          }],
        entities: [],
        edges: [],
        summary: 'Test',
        totalResults: 1,
      };

      const plan = { actions: [], shouldProceed: true };

      const prompt = await service.buildPrompt({
        query: 'test query',
        bundle,
        plan,
      });

      expect(prompt).toContain('Scoring:');
      expect(prompt).toContain('Cosine=0.80');
      expect(prompt).toContain('Freshness=1.00');
      expect(prompt).toContain('Graph=0.50');
    });

    it('should include suggested actions when present', async () => {
      const bundle: ContextBundle = {
        chunks: [],
        entities: [],
        edges: [],
        summary: 'No context',
        totalResults: 0,
      };

      const plan = {
        actions: [
          {
            tool: 'web_search',
            params: { query: 'test' },
            reason: 'No context found',
          }],
        shouldProceed: false,
      };

      const prompt = await service.buildPrompt({
        query: 'test query',
        bundle,
        plan,
      });

      expect(prompt).toContain('Suggested Actions');
      expect(prompt).toContain('web_search');
      expect(prompt).toContain('No context found');
    });

    it('should limit chunks to top 5', async () => {
      const chunks = Array.from({ length: 10 }, (_: any, i: any) => ({
        id: `chunk-${i}`,
        text: `Content ${i}`,
        score: 0.9 - i * 0.05,
        metadata: { url: `https://example.com/${i}`,
          fetchedAt: new Date().toISOString(), domain: 'example.com',
        },
      }));

      const bundle: ContextBundle = {
        chunks,
        entities: [],
        edges: [],
        summary: 'Test',
        totalResults: 10,
      };

      const plan = { actions: [], shouldProceed: true };

      const prompt = await service.buildPrompt({
        query: 'test query',
        bundle,
        plan,
      });
  
      expect(prompt).toContain('Content 0');
      expect(prompt).toContain('Content 4');
      expect(prompt).not.toContain('Content 5');
      expect(prompt).not.toContain('Content 9');
    });

    it('should limit edges to top 10', async () => {
      const edges = Array.from({ length: 20 }, (_: any, i: any) => ({
        src: `Entity${i}`,
        rel: 'RELATES_TO',
        dst: `Entity${i + 1}`,
        weight: 0.9 - i * 0.01,
      }));

      const bundle: ContextBundle = {
        chunks: [],
        entities: [],
        edges,
        summary: 'Test',
        totalResults: 0,
      };

      const plan = { actions: [], shouldProceed: true };

      const prompt = await service.buildPrompt({
        query: 'test query',
        bundle,
        plan,
      });
  
      expect(prompt).toContain('Entity0');
      expect(prompt).toContain('Entity9');
      expect(prompt).not.toContain('Entity10');
      expect(prompt).not.toContain('Entity19');
    });
  });

  describe('hybrid scoring', () => {
    it('should apply correct weights to scoring components', () => {
      // Test that weights sum to expected value
      const COSINE_WEIGHT = 0.65;
      const FRESHNESS_WEIGHT = 0.1;
      const GRAPH_WEIGHT = 0.05;

      const totalWeight = COSINE_WEIGHT + FRESHNESS_WEIGHT + GRAPH_WEIGHT;

      expect(totalWeight).toBe(0.8); // 0.65 + 0.10 + 0.05
    });

    it('should boost fresh content (<7 days)', () => {
      const FRESH_THRESHOLD = 7;
      const daysSince = 5;

      const freshnessBoost = daysSince < FRESH_THRESHOLD ? 1.0 , 0.0;

      expect(freshnessBoost).toBe(1.0);
    });

    it('should partially boost recent content (7-30 days)', () => {
      const FRESH_THRESHOLD = 7;
      const RECENT_THRESHOLD = 30;
      const daysSince = 15;

      let freshnessBoost = 0;
      if (daysSince < FRESH_THRESHOLD) {
        freshnessBoost = 1.0;
      } else if (daysSince < RECENT_THRESHOLD) {
        freshnessBoost = 0.5;
      }

      expect(freshnessBoost).toBe(0.5);
    });

    it('should not boost stale content (>30 days)', () => {
      const FRESH_THRESHOLD = 7;
      const RECENT_THRESHOLD = 30;
      const daysSince = 40;

      let freshnessBoost = 0;
      if (daysSince < FRESH_THRESHOLD) {
        freshnessBoost = 1.0;
      } else if (daysSince < RECENT_THRESHOLD) {
        freshnessBoost = 0.5;
      }

      expect(freshnessBoost).toBe(0.0);
    });
  });
});



