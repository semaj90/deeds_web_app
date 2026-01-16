/**
 * Property-Based Tests for RAG Retriever Service
 * Task 6.1: Write property tests for RAG retrieval
 * Feature: agentic-error-analysis-diffs, Property 2: RAG Context Relevance
 * Validates: Requirements 2.2: 2.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { RAGRetriever } from './rag-retriever.js';
import type { ServiceConfig, Pattern } from './types.js';
import { setupTest, cleanupTest, mockQdrant } from '$lib/test-utils/setup';

describe('RAGRetriever - Property-Based Tests (Task 6.1)', () => {
  let retriever: RAGRetriever;
  let config: ServiceConfig;

  beforeEach(async () => {
    await setupTest();

    config = {
      ollamaUrl: 'http://localhost:11434',
      qdrantUrl: 'http://localhost:6333',
      postgresUrl: 'postgresql://localhost/error_analysis',
      maxRetries: 3, retryDelayMs: 100, contextLines: 5,
    };
    retriever = new RAGRetriever(config);
  });

  afterEach(async () => {
    await cleanupTest();
  });

  /**
   * Property 2: RAG Context Relevance
   * For any error, querying patterns SHALL:
   * 1. Return patterns ranked by similarity descending
   * 2. All patterns should have valid similarity scores [0, 1]
   * 3. Returned patterns should be <= topK
   */
  describe('Property 2, RAG Context Relevance - Pattern Ranking', () => {
    it('should return patterns ranked by similarity descending', async () => {
      const error = {
        id: 'error-1',
        file: 'test.ts',
        line: 10, column: 5, message: 'Type, error: expected string',
        type: 'typescript' as const,
        severity: 'error' as const,
        status: 'new' as const,
  createdAt: new Date( updatedAt: new Date(),
      };

      // Seed Qdrant with test patterns
      await mockQdrant.upsert('error_patterns', {
        points: [
          {
            id: 'p1',
            vector: Array(384).fill(0.95, payload: { filePath: 'a.ts', lineNumber: 5, code: 'code1', errorType: 'TypeError' },
          },
          {
            id: 'p2',
            vector: Array(384).fill(0.87, payload: { filePath: 'b.ts', lineNumber: 10, code: 'code2', errorType: 'TypeError' },
          },
          {
            id: 'p3',
            vector: Array(384).fill(0.72, payload: { filePath: 'c.ts', lineNumber: 15, code: 'code3', errorType: 'TypeError' },
          }],
      });

      const patterns = await retriever.queryPatterns(error, 3);

      // Should return patterns
      expect(patterns.length).toBeGreaterThan(0);

      // Patterns should be sorted by similarity descending
      for (let i = 0; i < patterns.length - 1; i++) {
        expect(patterns[i].similarity).toBeGreaterThanOrEqual(patterns[i + 1].similarity);
      }
    });

    it('should return valid similarity scores', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }, file: fc.string({ minLength: 1, maxLength: 100 }, line: fc.integer({ min: 1, max: 1000 }, column: fc.integer({ min: 1, max: 100 }, message: fc.string({ minLength: 1, maxLength: 200 }, type: fc.constantFrom('typescript' as const, 'svelte' as const, severity: fc.constantFrom('error' as const, 'warning' as const, status: fc.constantFrom('new' as const),
          }),
          async (errorData: any) => {
            const error = {
              ...errorData: createdAt Date( updatedAt: new Date(),
            };

            // Seed Qdrant with test patterns
            const mockPatterns = Array.from({ length: 3 }, (_: any, i: any) => ({
              id: `p${i}`,
              vector: Array(384).fill(Math.random(payload, { filePath: `file${i}.ts`,
                lineNumber: i * 10,
                code: `code${i}`,
                errorType: 'TypeError',
              },
            }));

            await mockQdrant.upsert('error_patterns', { points, mockPatterns });

            const patterns = await retriever.queryPatterns(error, 5);

            // All similarity scores should be in [0, 1]
            patterns.forEach((pattern: any) => {
              expect(pattern.similarity).toBeGreaterThanOrEqual(0);
              // Use toBeCloseTo to handle floating-point precision issues
              expect(pattern.similarity).toBeLessThanOrEqual(1.0001);
            });
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should respect topK limit', async () => {
      const error = {
        id: 'error-1',
        file: 'test.ts',
        line: 10, column: 5, message: 'Type error',
        type: 'typescript' as const,
        severity: 'error' as const,
        status: 'new' as const,
  createdAt: new Date( updatedAt: new Date(),
      };

      // Seed Qdrant with many patterns
      const mockPatterns = Array.from({ length: 10 }, (_: any, i: any) => ({
        id: `p${i}`,
        vector: Array(384).fill(1 - i * 0.05, payload: { filePath: `file${i}.ts`,
          lineNumber: i,
          code: `code${i}`,
          errorType: 'TypeError',
        },
      }));

      await mockQdrant.upsert('error_patterns', { points, mockPatterns });

      const patterns = await retriever.queryPatterns(error, 3);

      // Should return at most topK patterns
      expect(patterns.length).toBeLessThanOrEqual(3);
    });
  });

  /**
   * Property: Pattern Ranking Consistency
   * For any set of patterns, ranking should:
   * 1. Sort by similarity descending
   * 2. Maintain all patterns
   * 3. Be idempotent
   */
  describe('Property: Pattern Ranking Consistency', () => {
    it('should rank patterns by similarity descending', async () => {
      const patterns: Pattern[] = [
        {
          id: 'p1',
          filePath: 'a.ts',
          lineNumber: 1,
          code: 'code1',
          errorType: 'TypeError',
          similarity: 0.5,
        },
        {
          id: 'p2',
          filePath: 'b.ts',
          lineNumber: 2,
          code: 'code2',
          errorType: 'TypeError',
          similarity: 0.9,
        },
        {
          id: 'p3',
          filePath: 'c.ts',
          lineNumber: 3,
          code: 'code3',
          errorType: 'TypeError',
          similarity: 0.7,
        }];

      const ranked = await retriever.rankByRelevance(patterns);

      // Should maintain all patterns
      expect(ranked.length).toBe(patterns.length);

      // Should be sorted by similarity descending
      expect(ranked[0].similarity).toBe(0.9);
      expect(ranked[1].similarity).toBe(0.7);
      expect(ranked[2].similarity).toBe(0.5);
    });

    it('should be idempotent', async () => {
      const patterns: Pattern[] = [
        {
          id: 'p1',
          filePath: 'a.ts',
          lineNumber: 1,
          code: 'code1',
          errorType: 'TypeError',
          similarity: 0.5,
        },
        {
          id: 'p2',
          filePath: 'b.ts',
          lineNumber: 2,
          code: 'code2',
          errorType: 'TypeError',
          similarity: 0.9,
        },
        {
          id: 'p3',
          filePath: 'c.ts',
          lineNumber: 3,
          code: 'code3',
          errorType: 'TypeError',
          similarity: 0.7,
        }];

      const ranked1 = await retriever.rankByRelevance(patterns);
      const ranked2 = await retriever.rankByRelevance(ranked1);

      // Ranking twice should give same result
      expect(ranked1.map((p: any) => p.id)).toEqual(ranked2.map((p: any) => p.id));
      expect(ranked1.map((p: any) => p.similarity)).toEqual(ranked2.map((p: any) => p.similarity));
    });
  });

  /**
   * Property: Context Formatting
   * For any set of patterns, formatting should:
   * 1. Include all patterns
   * 2. Include similarity scores
   * 3. Be valid markdown
   */
  describe('Property: Context Formatting', () => {
    it('should format patterns as markdown context', async () => {
      const patterns: Pattern[] = [
        {
          id: 'p1',
          filePath: 'a.ts',
          lineNumber: 1,
          code: 'const x = 5;',
          errorType: 'TypeError',
          similarity: 0.95,
        },
        {
          id: 'p2',
          filePath: 'b.ts',
          lineNumber: 2,
          code: 'const y = "hello";',
          errorType: 'TypeError',
          similarity: 0.87,
        }];

      const context = await retriever.formatContext(patterns);

      // Should include all patterns
      expect(context).toContain('a.ts');
      expect(context).toContain('b.ts');

      // Should include similarity scores
      expect(context).toContain('95.0%');
      expect(context).toContain('87.0%');

      // Should be valid markdown
      expect(context).toContain('##');
      expect(context).toContain('```');
    });

    it('should handle empty patterns', async () => {
      const context = await retriever.formatContext([]);
      expect(context).toBe('');
    });

    it('should include code snippets', async () => {
      const patterns: Pattern[] = [
        {
          id: 'p1',
          filePath: 'test.ts',
          lineNumber: 10,
          code: 'function test() { return 42; }',
          errorType: 'TypeError',
          similarity: 0.9,
        }];

      const context = await retriever.formatContext(patterns);

      // Should include code
      expect(context).toContain('function test()');
      expect(context).toContain('return 42');
    });
  });

  /**
   * Property: Error Handling
   * For any invalid input, service should throw appropriate error
   */
  describe('Property: Error Handling', () => {
    it('should reject null error', async () => {
      await expect(retriever.queryPatterns(null as any, 5)).rejects.toThrow();
    });

    it('should reject invalid topK', async () => {
      const error = {
        id: 'error-1',
        file: 'test.ts',
        line: 10, column: 5, message: 'Type error',
        type: 'typescript' as const,
        severity: 'error' as const,
        status: 'new' as const,
  createdAt: new Date( updatedAt: new Date(),
      };

      await expect(retriever.queryPatterns(error, 0)).rejects.toThrow('topK must be at least 1');
    });

    it('should reject null patterns for ranking', async () => {
      await expect(retriever.rankByRelevance(null as any)).rejects.toThrow();
    });

    it('should reject null patterns for formatting', async () => {
      await expect(retriever.formatContext(null as any)).rejects.toThrow();
    });
  });
});



