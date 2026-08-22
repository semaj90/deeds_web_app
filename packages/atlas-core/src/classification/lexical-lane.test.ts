/**
 * Lexical Lane Tests
 *
 * Validates keyword-based domain classification
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  termFrequency,
  inverseDocumentFrequency,
  tfIdfScore,
  scoreDomain,
  classifyLexical,
  classifyLexicalBatch,
  computeAggregateConfidence,
  computeMetrics,
  DOMAIN_KEYWORDS,
} from './lexical-lane.js';

describe('Lexical Lane', () => {
  describe('normalizeText', () => {
    it('should convert to lowercase', () => {
      const result = normalizeText('AUTH');
      expect(result).toContain('auth');
    });

    it('should split CamelCase', () => {
      const result = normalizeText('validateSession');
      expect(result).toContain('validate');
      expect(result).toContain('session');
    });

    it('should handle path delimiters', () => {
      const result = normalizeText('src/lib/auth/login.ts');
      expect(result).toContain('src');
      expect(result).toContain('lib');
      expect(result).toContain('auth');
      expect(result).toContain('login');
    });

    it('should filter empty strings', () => {
      const result = normalizeText('a__b');
      expect(result).not.toContain('');
    });
  });

  describe('termFrequency', () => {
    it('should compute TF correctly', () => {
      const words = ['auth', 'session', 'auth', 'login'];
      const tf = termFrequency('auth', words);
      expect(tf).toBe(0.5);  // 2 occurrences / 4 total
    });

    it('should return 0 for missing word', () => {
      const words = ['auth', 'session'];
      const tf = termFrequency('missing', words);
      expect(tf).toBe(0);
    });

    it('should handle empty word list', () => {
      const tf = termFrequency('auth', []);
      expect(tf).toBe(0);
    });
  });

  describe('inverseDocumentFrequency', () => {
    it('should compute IDF correctly', () => {
      const keywords = {
        auth: ['session', 'auth'],
        retrieval: ['search', 'query'],
      };

      const idf = inverseDocumentFrequency('session', keywords);
      expect(idf).toBeGreaterThan(0);  // Appears in 1/2 domains
    });

    it('should return 0 for word in no domains', () => {
      const keywords = {
        auth: ['session'],
        retrieval: ['search'],
      };

      const idf = inverseDocumentFrequency('missing', keywords);
      expect(idf).toBe(0);
    });
  });

  describe('scoreDomain', () => {
    it('should score auth domain correctly', () => {
      const textWords = ['authenticate', 'session', 'login', 'user', 'verify'];
      const score = scoreDomain('auth', textWords, DOMAIN_KEYWORDS);
      expect(score).toBeGreaterThan(0.5);  // Strong auth signals
    });

    it('should score retrieval domain correctly', () => {
      const textWords = ['search', 'query', 'qdrant', 'vector', 'similarity'];
      const score = scoreDomain('retrieval', textWords, DOMAIN_KEYWORDS);
      expect(score).toBeGreaterThan(0.5);  // Strong retrieval signals
    });

    it('should return 0 for no keyword matches', () => {
      const textWords = ['xyz', 'abc', 'def'];
      const score = scoreDomain('auth', textWords, DOMAIN_KEYWORDS);
      expect(score).toBe(0);
    });

    it('should return 0 for score below minimum confidence', () => {
      const textWords = ['auth'];
      const score = scoreDomain('auth', textWords, DOMAIN_KEYWORDS, 0.9);
      expect(score).toBe(0);  // Low confidence, below threshold
    });
  });

  describe('classifyLexical', () => {
    it('should classify auth-heavy text', () => {
      const scores = classifyLexical(
        '550e8400-e29b-41d4-a716-446655440000',
        'src/lib/server/auth/lucia-session-handler.ts',
        'user_authentication_session_manager'
      );

      expect(scores.length).toBeGreaterThan(0);
      expect(scores[0].domain).toBe('auth');  // Should be top domain
      expect(scores[0].score).toBeGreaterThan(0.5);
    });

    it('should classify retrieval-heavy text', () => {
      const scores = classifyLexical(
        '550e8400-e29b-41d4-a716-446655440000',
        'src/lib/server/retrieval/qdrant-search-orchestrator.ts',
        'vector_similarity_search'
      );

      expect(scores.length).toBeGreaterThan(0);
      const domains = scores.map((s) => s.domain);
      expect(domains).toContain('retrieval');
    });

    it('should return empty array for no matches', () => {
      const scores = classifyLexical(
        '550e8400-e29b-41d4-a716-446655440000',
        'xyz/abc/def.xyz',
        'unrelated_text'
      );

      expect(scores).toEqual([]);
    });

    it('should respect topK parameter', () => {
      const scores = classifyLexical(
        '550e8400-e29b-41d4-a716-446655440000',
        'src/lib/server/auth/qdrant/search.ts',  // Mixed auth + retrieval
        '',
        3  // topK = 3
      );

      expect(scores.length).toBeLessThanOrEqual(3);
    });

    it('should include explanation in scores', () => {
      const scores = classifyLexical(
        '550e8400-e29b-41d4-a716-446655440000',
        'src/lib/auth/login.ts'
      );

      expect(scores[0].explanation).toBeDefined();
      expect(scores[0].explanation).toContain('Matched keywords');
    });
  });

  describe('classifyLexicalBatch', () => {
    it('should classify multiple entities', () => {
      const entities = [
        {
          entityId: '550e8400-e29b-41d4-a716-446655440000',
          sourceRef: 'src/lib/auth/login.ts',
        },
        {
          entityId: '550e8400-e29b-41d4-a716-446655440001',
          sourceRef: 'src/lib/retrieval/search.ts',
        },
        {
          entityId: '550e8400-e29b-41d4-a716-446655440002',
          sourceRef: 'src/lib/embedding/vector.ts',
        },
      ];

      const results = classifyLexicalBatch(entities);

      expect(Object.keys(results)).toHaveLength(3);
      expect(results['550e8400-e29b-41d4-a716-446655440000'][0].domain).toBe('auth');
      expect(results['550e8400-e29b-41d4-a716-446655440001'][0].domain).toBe('retrieval');
      expect(results['550e8400-e29b-41d4-a716-446655440002'][0].domain).toBe('embedding');
    });

    it('should handle mixed domains in single source', () => {
      const entities = [
        {
          entityId: '550e8400-e29b-41d4-a716-446655440000',
          sourceRef: 'src/lib/server/auth/qdrant-session-search.ts',
          additionalText: 'user_vector_authentication',
        },
      ];

      const results = classifyLexicalBatch(entities);
      const domains = results['550e8400-e29b-41d4-a716-446655440000'].map((s) => s.domain);

      expect(domains).toContain('auth');
      expect(domains).toContain('retrieval');  // or 'embedding'
    });
  });

  describe('computeAggregateConfidence', () => {
    it('should average scores correctly', () => {
      const scores = [
        { domain: 'auth', score: 0.8, source: 'LEXICAL_KEYWORD' as const },
        { domain: 'retrieval', score: 0.6, source: 'LEXICAL_KEYWORD' as const },
      ];

      const avg = computeAggregateConfidence(scores);
      expect(avg).toBe(0.7);  // (0.8 + 0.6) / 2
    });

    it('should return 0 for empty array', () => {
      const avg = computeAggregateConfidence([]);
      expect(avg).toBe(0);
    });

    it('should handle rounding', () => {
      const scores = [
        { domain: 'auth', score: 0.333, source: 'LEXICAL_KEYWORD' as const },
        { domain: 'retrieval', score: 0.333, source: 'LEXICAL_KEYWORD' as const },
        { domain: 'embedding', score: 0.334, source: 'LEXICAL_KEYWORD' as const },
      ];

      const avg = computeAggregateConfidence(scores);
      expect(avg).toBeCloseTo(0.333, 3);
    });
  });

  describe('computeMetrics', () => {
    it('should compute metrics for classifications', () => {
      const classifications = {
        entity1: [
          { domain: 'auth', score: 0.8, source: 'LEXICAL_KEYWORD' as const },
        ],
        entity2: [
          { domain: 'retrieval', score: 0.7, source: 'LEXICAL_KEYWORD' as const },
          { domain: 'embedding', score: 0.6, source: 'LEXICAL_KEYWORD' as const },
        ],
        entity3: [],  // No classifications
      };

      const metrics = computeMetrics(classifications);

      expect(metrics.totalEntities).toBe(3);
      expect(metrics.classifiedEntities).toBe(2);
      expect(metrics.coveragePercentage).toBeCloseTo(66.67, 1);
      expect(metrics.averageConfidence).toBeCloseTo(0.7, 1);
      expect(metrics.averageDomainsPerEntity).toBeCloseTo(1, 1);
      expect(metrics.minConfidenceObserved).toBe(0.6);
      expect(metrics.maxConfidenceObserved).toBe(0.8);
    });

    it('should handle empty classifications', () => {
      const metrics = computeMetrics({});

      expect(metrics.totalEntities).toBe(0);
      expect(metrics.classifiedEntities).toBe(0);
      expect(metrics.coveragePercentage).toBe(0);
      expect(metrics.averageConfidence).toBe(0);
    });
  });

  describe('Integration: Full Pipeline', () => {
    it('should classify realistic codebase file paths', () => {
      const testCases = [
        {
          path: 'src/lib/server/auth/lucia-provider.ts',
          expectedDomain: 'auth',
        },
        {
          path: 'src/lib/server/retrieval/qdrant-manager.ts',
          expectedDomain: 'retrieval',
        },
        {
          path: 'src/routes/api/embed/+server.ts',
          expectedDomain: 'embedding',
        },
        {
          path: 'src/lib/components/CaseCard.svelte',
          expectedDomain: 'ui_components',
        },
        {
          path: 'tests/unit/auth.test.ts',
          expectedDomain: 'testing',
        },
      ];

      for (const testCase of testCases) {
        const scores = classifyLexical(
          'test-entity',
          testCase.path
        );

        expect(scores.length).toBeGreaterThan(0);
        const topDomain = scores[0].domain;
        expect(topDomain).toBe(testCase.expectedDomain);
      }
    });

    it('should achieve ≥80% coverage on 100-entity sample', () => {
      // Simulate 100 entities with realistic source refs
      const entities = Array.from({ length: 100 }, (_, i) => ({
        entityId: `entity-${i}`,
        sourceRef: [
          'src/lib/auth/index.ts',
          'src/lib/retrieval/search.ts',
          'src/lib/embedding/model.ts',
          'src/routes/api/auth/+server.ts',
          'tests/unit/auth.test.ts',
          'docs/auth-guide.md',
        ][i % 6],
      }));

      const results = classifyLexicalBatch(entities);
      const classifiedCount = Object.values(results).filter((scores) => scores.length > 0).length;
      const coverage = (classifiedCount / entities.length) * 100;

      expect(coverage).toBeGreaterThanOrEqual(80);
    });
  });
});
