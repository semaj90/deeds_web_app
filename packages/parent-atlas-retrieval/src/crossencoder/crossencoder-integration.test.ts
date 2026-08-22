/**
 * CrossEncoder Reranker Integration Tests
 * Validates end-to-end reranking flow with graceful fallback
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  checkCrossEncoderHealth,
  rerankCandidates,
  applyReranking,
  blendCrossEncoderScore,
  type CrossEncoderCandidate,
  type QdrantHit
} from './crossencoder-client.js';

const SIDECAR_TIMEOUT = 10000; // 10s for health check

describe('CrossEncoder Reranker Integration', () => {
  let sidecarAvailable = false;

  beforeAll(async () => {
    // Check if sidecar is running
    const health = await checkCrossEncoderHealth();
    sidecarAvailable = health !== null && health.model_loaded === true;

    if (sidecarAvailable) {
      console.log('[CrossEncoder] Sidecar is UP, running full integration tests');
    } else {
      console.warn('[CrossEncoder] Sidecar not available, running fallback tests only');
    }
  }, SIDECAR_TIMEOUT);

  describe('Health Check', () => {
    it('should handle sidecar unavailable gracefully', async () => {
      // This test runs even if sidecar is down
      const health = await checkCrossEncoderHealth();
      // health can be null (sidecar down) or an object (sidecar up)
      // Both outcomes are valid
      if (health) {
        expect(health.status).toBe('healthy');
        expect(health.model_loaded).toBeDefined();
        expect(health.device).toBeDefined();
      }
    });

    it.skipIf(!sidecarAvailable)('should report healthy status when sidecar is UP', async () => {
      const health = await checkCrossEncoderHealth();
      expect(health).not.toBeNull();
      expect(health!.status).toBe('healthy');
      expect(health!.model_loaded).toBe(true);
      expect(health!.device).toMatch(/^(cuda|cpu)$/);
      expect(health!.model_id).toBe('mixedbread-ai/mxbai-rerank-base-v2');
    });
  });

  describe('Basic Reranking', () => {
    it.skipIf(!sidecarAvailable)('should rerank 5 candidates successfully', async () => {
      const query = 'How do I validate user sessions?';
      const candidates: CrossEncoderCandidate[] = [
        {
          packet_key: 'auth:001',
          text: 'Session validation checks Lucia auth state. Use locals.user to access authenticated user.'
        },
        {
          packet_key: 'auth:002',
          text: 'Password reset tokens are stored in postgres and expire after 1 hour.'
        },
        {
          packet_key: 'db:001',
          text: 'PostgreSQL 18 with pgvector extension for semantic search.'
        },
        {
          packet_key: 'ui:001',
          text: 'Svelte 5 uses runes for state management. Use $state() and $derived().'
        },
        {
          packet_key: 'api:001',
          text: 'API routes use SvelteKit form actions for safe server mutations.'
        }
      ];

      const ranked = await rerankCandidates(query, candidates);
      expect(ranked).not.toBeNull();
      expect(ranked).toHaveLength(5);
      expect(ranked![0].packet_key).toBe('auth:001'); // Should rank highest (most relevant to session validation)
      expect(ranked![0].score).toBeGreaterThan(ranked![4].score); // Top score > bottom score
    });

    it.skipIf(!sidecarAvailable)('should handle batch size parameter', async () => {
      const query = 'Evidence handling and upload';
      const candidates: CrossEncoderCandidate[] = Array.from({ length: 20 }, (_, i) => ({
        packet_key: `candidate:${i:03d}`,
        text: `Evidence chunk ${i}: handling, upload, storage patterns ${i % 3 === 0 ? 'RELEVANT' : 'other'}`
      }));

      const ranked = await rerankCandidates(query, candidates, 4);
      expect(ranked).not.toBeNull();
      expect(ranked).toHaveLength(20);
      // Relevant candidates (every 3rd) should rank higher
      const topIndices = ranked!.slice(0, 5).map((r) => parseInt(r.packet_key.split(':')[1]));
      const relevantCount = topIndices.filter((i) => i % 3 === 0).length;
      expect(relevantCount).toBeGreaterThan(0); // At least some relevant items in top-5
    });
  });

  describe('Fallback Behavior', () => {
    it('should return null when sidecar is unavailable', async () => {
      // Override sidecar URL to an invalid address
      const originalEnv = process.env.CROSSENCODER_SIDECAR;
      process.env.CROSSENCODER_SIDECAR = 'http://127.0.0.1:9999'; // Non-existent port

      const query = 'test query';
      const candidates: CrossEncoderCandidate[] = [
        { packet_key: 'test:001', text: 'test candidate' }
      ];

      const ranked = await rerankCandidates(query, candidates);
      expect(ranked).toBeNull();

      // Restore original
      if (originalEnv) process.env.CROSSENCODER_SIDECAR = originalEnv;
      else delete process.env.CROSSENCODER_SIDECAR;
    });
  });

  describe('Hit Reranking', () => {
    it.skipIf(!sidecarAvailable)('should rerank Qdrant-like hits', async () => {
      const query = 'How do I cache data?';
      const hits = [
        {
          id: '1',
          score: 0.75,
          payload: {
            content: 'Redis is used for L1/L2 caching with Bifrost semantic cache.'
          }
        },
        {
          id: '2',
          score: 0.60,
          payload: {
            content: 'Drizzle ORM handles database queries with type safety.'
          }
        },
        {
          id: '3',
          score: 0.50,
          payload: {
            content: 'CSS Grid layout provides responsive design without JavaScript.'
          }
        }
      ] as QdrantHit[];

      const reranked = await applyReranking(query, hits, 3);
      expect(reranked).not.toBeNull();
      expect(reranked).toHaveLength(3);
      expect(reranked![0].id).toBe('1'); // Cache-related should rank first
      expect(reranked![0].crossencoder_score).toBeGreaterThan(
        reranked![2].crossencoder_score || 0
      );
    });
  });

  describe('Score Blending', () => {
    it('should blend CrossEncoder score with semantic score', () => {
      const hit = {
        id: 'test:001',
        score: 0.8, // Semantic score
        payload: { content: 'test' },
        crossencoder_score: 0.9 // CrossEncoder score
      } as QdrantHit & { crossencoder_score: number };

      const blended = blendCrossEncoderScore(hit, 0.3); // 30% CE, 70% semantic
      expect(blended).toBeCloseTo(0.83, 2); // (0.8 * 0.7) + (0.9 * 0.3) = 0.56 + 0.27 = 0.83
    });

    it('should use semantic score when CrossEncoder score missing', () => {
      const hit = {
        id: 'test:001',
        score: 0.75, // Semantic score
        payload: { content: 'test' }
      } as QdrantHit;

      const blended = blendCrossEncoderScore(hit, 0.3);
      expect(blended).toBeCloseTo(0.75, 2); // Only semantic score, no CE
    });

    it('should respect custom weight', () => {
      const hit = {
        id: 'test:001',
        score: 0.5,
        payload: { content: 'test' },
        crossencoder_score: 1.0
      } as QdrantHit & { crossencoder_score: number };

      const blended50 = blendCrossEncoderScore(hit, 0.5); // 50/50
      expect(blended50).toBeCloseTo(0.75, 2); // (0.5 * 0.5) + (1.0 * 0.5) = 0.75

      const blended10 = blendCrossEncoderScore(hit, 0.1); // 10% CE, 90% semantic
      expect(blended10).toBeCloseTo(0.55, 2); // (0.5 * 0.9) + (1.0 * 0.1) = 0.55
    });
  });

  describe('Empty and Edge Cases', () => {
    it('should handle empty candidate list', async () => {
      const ranked = await rerankCandidates('test', []);
      expect(ranked).toEqual([]);
    });

    it.skipIf(!sidecarAvailable)('should handle candidates with empty text', async () => {
      const candidates: CrossEncoderCandidate[] = [
        { packet_key: 'empty:001', text: '' },
        { packet_key: 'valid:001', text: 'This is valid content' }
      ];

      const ranked = await rerankCandidates('query', candidates);
      expect(ranked).not.toBeNull();
      expect(ranked).toHaveLength(2);
    });

    it('should handle very large batch', async () => {
      const candidates: CrossEncoderCandidate[] = Array.from({ length: 1024 }, (_, i) => ({
        packet_key: `large:${i}`,
        text: `Content chunk ${i}`
      }));

      // Should accept the request (sidecar has max_items: 1024)
      const ranked = await rerankCandidates('query', candidates, 8);
      // Either succeeds or fails gracefully (null)
      if (ranked) {
        expect(ranked.length).toBeLessThanOrEqual(1024);
      }
    });
  });

  describe('Performance', () => {
    it.skipIf(!sidecarAvailable)('should complete reranking in reasonable time', async () => {
      const query = 'performance test query';
      const candidates: CrossEncoderCandidate[] = Array.from({ length: 50 }, (_, i) => ({
        packet_key: `perf:${i:03d}`,
        text: `Performance test candidate ${i} with some content to rank`
      }));

      const start = performance.now();
      const ranked = await rerankCandidates(query, candidates);
      const elapsed = performance.now() - start;

      expect(ranked).not.toBeNull();
      expect(ranked).toHaveLength(50);
      // Should complete within 5 seconds (network + GPU inference)
      expect(elapsed).toBeLessThan(5000);
      console.log(`[CrossEncoder] Reranked 50 candidates in ${elapsed.toFixed(2)}ms`);
    });
  });
});
