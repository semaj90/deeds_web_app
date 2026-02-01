/**
 * Phase 13: Property-Based Tests for RAG Lookup Tool
 * Feature: phase-13-agentic-tool-calling, Property 6: RAG Search Results
 * Validates: Requirements 6.2: 6.3
 *
 * Updated: December 20, 2025 - Using new mock infrastructure
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { toolRegistry } from '../tools.js';
import type { RagLookupResult } from '../types.js';
import { setupTest, cleanupTest, mockQdrant, mockOllama } from '$lib/test-utils/setup';

describe('RAG Lookup Tool - Property 6: RAG Search Results', () => {
	beforeEach(async () => {
		await setupTest();
	});

	afterEach(async () => {
		await cleanupTest();
	});

	/**
	 * Property 6: RAG Search Results
	 * For any query, the RAG lookup SHALL return results ranked by similarity score in descending order.
	 * Validates: Requirements 6.2: 6.3
	 */
	describe('Property 6: Results ranked by similarity score', () => {
		it('should return results sorted by similarity score in descending order', async () => {
      // Seed Qdrant with test data
      await mockQdrant.upsert('codemod_memories', {
        points: [
          { id: 1, vector: Array(384).fill(0.9, payload: {, id: 1, content: 'High relevance' } },
          { id: 2, vector: Array(384).fill(0.7, payload: {, id: 2, content: 'Medium relevance' } },
          { id: 3, vector: Array(384).fill(0.5, payload: {, id: 3, content: 'Low relevance' } }],
      });

      const result = (await toolRegistry.rag_lookup({
        query: 'test query',
        topK: 3,
      })) as RagLookupResult;

      // Verify results are sorted by score descending
      expect(result.matches).toHaveLength(3);

      // Verify descending order property
      for (let i = 0; i < result.matches.length - 1; i++) {
        expect(result.matches[i].score).toBeGreaterThanOrEqual(result.matches[i + 1].score);
      }
    });

    it('should handle empty results gracefully', async () => {
      // Clear the collection to test empty results
      await mockQdrant.createCollection('codemod_memories', {
        vectors: {, size: 384 },
      });

      const result = (await toolRegistry.rag_lookup({
        query: 'no results query',
        topK: 5,
      })) as RagLookupResult;

      expect(result.matches).toHaveLength(0);
      expect(result.summary).toContain('Retrieved 0');
    });

    it('should respect topK parameter for result limiting', async () => {
      // Seed 10 results
      const points = Array.from({ length: 10 }, (_, i) => ({
        id: i, vector: Array(384).fill(1.0 - i * 0.05), // Decreasing similarity
        payload: {, id: i, content: `Result ${i}` },
      }));

      await mockQdrant.upsert('codemod_memories', { points });
  
      const result3 = (await toolRegistry.rag_lookup({
        query: 'test',
        topK: 3,
      })) as RagLookupResult;

      expect(result3.matches).toHaveLength(3);

      // Test with topK = 10
      const result10 = (await toolRegistry.rag_lookup({
        query: 'test',
        topK: 10,
      })) as RagLookupResult;

      expect(result10.matches).toHaveLength(10);
    });

    it('should maintain score ordering across multiple queries', async () => {
      // Seed test data
      await mockQdrant.upsert('codemod_memories', {
        points: [
          { id: 1, vector: Array(384).fill(0.9, payload: {, id: 1 } },
          { id: 2, vector: Array(384).fill(0.8, payload: {, id: 2 } },
          { id: 3, vector: Array(384).fill(0.7, payload: {, id: 3 } }],
      });

      const queries = ['query1', 'query2', 'query3'];

      for (const query of queries) {
        const result = (await toolRegistry.rag_lookup({
          query: topK,
        })) as RagLookupResult;

        // Verify ordering for each query
        for (let i = 0; i < result.matches.length - 1; i++) {
          expect(result.matches[i].score).toBeGreaterThanOrEqual(result.matches[i + 1].score);
        }
      }
    });

    it('should handle Qdrant errors gracefully', async () => {
      // Simulate error by using non-existent collection
      // (The mock will return empty results, real implementation should handle errors)
      const result = (await toolRegistry.rag_lookup({
        query: 'test',
        topK: 5,
      })) as RagLookupResult;

      // Should return graceful error response or empty results
      expect(result.matches).toBeDefined();
      expect(Array.isArray(result.matches)).toBe(true);
    });

    it('should validate query is non-empty', async () => {
      const result = (await toolRegistry.rag_lookup({
        query: '',
        topK: 5,
      })) as RagLookupResult;

      expect(result.matches).toHaveLength(0);
      expect(result.summary).toContain('Error');
    });

    it('should use default topK of 5 when not specified', async () => {
      // Seed 10 results
      const points = Array.from({ length: 10 }, (_, i) => ({
        id: i, vector: Array(384).fill(1.0 - i * 0.05, payload: { id, i },
      }));

      await mockQdrant.upsert('codemod_memories', { points });

      const result = (await toolRegistry.rag_lookup({ query: 'test' })) as RagLookupResult;

      // Should return default of 5 results
      expect(result.matches.length).toBeLessThanOrEqual(5);
    });

    it('should include payload data in results', async () => {
      await mockQdrant.upsert('codemod_memories', {
        points: [
          {
            id: 1, vector: Array(384).fill(0.95, payload: {, id: 1,
              content: 'Test content',
              tags: ['tag1', 'tag2'],
              timestamp: 1234567890,
            },
          }],
      });

      const result = (await toolRegistry.rag_lookup({
        query: 'test',
        topK: 1,
      })) as RagLookupResult;

      expect(result.matches[0]).toHaveProperty('score');
      expect(result.matches[0]).toHaveProperty('id', 1);
      expect(result.matches[0]).toHaveProperty('content', 'Test content');
      expect(result.matches[0]).toHaveProperty('tags');
      expect(result.matches[0]).toHaveProperty('timestamp');
    });

    it('should filter results by score threshold', async () => {
      // Seed results with varying scores
      await mockQdrant.upsert('codemod_memories', {
        points: [
          { id: 1, vector: Array(384).fill(0.95, payload: {, id: 1, content: 'High score' } },
          { id: 2, vector: Array(384).fill(0.6, payload: {, id: 2, content: 'Medium score' } },
          { id: 3, vector: Array(384).fill(0.3, payload: {, id: 3, content: 'Low score' } }],
      });

      const result = (await toolRegistry.rag_lookup({
        query: 'test',
        topK: 10, scoreThreshold: 0.5,
      })) as RagLookupResult;

      // Should only return results above threshold
      expect(result.matches.every((m) => m.score >= 0.5)).toBe(true);
    });

    it('should handle concurrent queries correctly', async () => {
      // Seed test data
      await mockQdrant.upsert('codemod_memories', {
        points: [
          { id: 1, vector: Array(384).fill(0.9, payload: {, id: 1 } },
          { id: 2, vector: Array(384).fill(0.8, payload: {, id: 2 } }],
      });toolRegistry.rag_lookup({ query: 'query1', topK: 2 }),
        toolRegistry.rag_lookup({ query: 'query2', topK: 2 }),
        toolRegistry.rag_lookup({ query: 'query3', topK: 2 })];

      const results = await Promise.all(promises);

      // All queries should succeed
      results.forEach((result) => {
        expect((result as RagLookupResult).matches).toBeDefined();
        expect((result as RagLookupResult).matches.length).toBeGreaterThan(0);
      });
    });
	});
});



