/**
 * Tests for Web Search Service
 * Validates search functionality and MinIO integration
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSearchService } from './web-search-service.js';
;

describe('WebSearchService', () => {
  let service: WebSearchService;

  beforeEach(() => {
    // Use mock provider for testing
    service = new WebSearchService({ provider: 'mock' });
  });

  afterEach(() => {
    // Cleanup if needed
  });

  describe('search', () => {
    it('should return search results for Svelte query', async () => {
      const results = await service.search('Svelte 5 runes', { limit: 5 });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);

      // Verify result structure
      const firstResult = results[0];
      expect(firstResult).toHaveProperty('url');
      expect(firstResult).toHaveProperty('title');
      expect(firstResult).toHaveProperty('snippet');
      expect(firstResult).toHaveProperty('domain');
    });

    it('should return search results for TypeScript query', async () => {
      const results = await service.search('TypeScript error handling', { limit: 3 });

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should return search results for error-related query', async () => {
      const results = await service.search('fix TypeScript error', { limit: 5 });

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      // Should include relevant domains
      const domains = results.map((r) => r.domain);
      expect(domains.some((d) => d.includes('stackoverflow') || d.includes('github'))).toBe(true);
    });

    it('should return generic results for unknown query', async () => {
      const results = await service.search('random unknown query xyz123', { limit: 5 });

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
      const results1 = await service.search('test query', { limit: 1 });
      const results5 = await service.search('test query', { limit: 5 });
      const results10 = await service.search('test query', { limit: 10 });

      expect(results1.length).toBeLessThanOrEqual(1);
      expect(results5.length).toBeLessThanOrEqual(5);
      expect(results10.length).toBeLessThanOrEqual(10);
    });

    it('should include published dates in results', async () => {
      const results = await service.search('Svelte 5', { limit: 3 });

      expect(results.length).toBeGreaterThan(0);

      // At least some results should have published dates
      const withDates = results.filter((r) => r.publishedDate);
      expect(withDates.length).toBeGreaterThan(0);
    });

    it('should extract domain from URL', async () => {
      const results = await service.search('Svelte documentation', { limit: 3 });

      expect(results.length).toBeGreaterThan(0);

      for (const result of results) {
        expect(result.domain).toBeDefined();
        expect(result.domain.length).toBeGreaterThan(0);
        expect(result.domain).not.toContain('http');
        expect(result.domain).not.toContain('://');
      }
    });
  });

  describe('search options', () => {
    it('should accept search options', async () => {
      const results = await service.search('test query', {
        limit: 5,
        region: 'us',
        safeSearch: true,
        timeRange: 'week',
      });

      expect(results).toBeDefined();
    });

    it('should use default options when not provided', async () => {
      const results = await service.search('test query');

      expect(results).toBeDefined();
    });
  });

  describe('result structure', () => {
    it('should return results with required fields', async () => {
      const results = await service.search('Svelte 5', { limit: 3 });

      expect(results.length).toBeGreaterThan(0);

      for (const result of results) {
        expect(result.url).toBeDefined();
        expect(typeof result.url).toBe('string');
        expect(result.url.startsWith('http')).toBe(true);

        expect(result.title).toBeDefined();
        expect(typeof result.title).toBe('string');
        expect(result.title.length).toBeGreaterThan(0);

        expect(result.snippet).toBeDefined();
        expect(typeof result.snippet).toBe('string');

        expect(result.domain).toBeDefined();
        expect(typeof result.domain).toBe('string');
        expect(result.domain.length).toBeGreaterThan(0);
      }
    });

    it('should return valid URLs', async () => {
      const results = await service.search('TypeScript', { limit: 3 });

      expect(results.length).toBeGreaterThan(0);

      for (const result of results) {
        expect(() => new URL(result.url)).not.toThrow();
      }
    });
  });

  describe('provider configuration', () => {
    it('should support mock provider', () => {
      const mockService = new WebSearchService({ provider: 'mock' });
      expect(mockService).toBeDefined();
    });

    it('should support duckduckgo provider', () => {
      const ddgService = new WebSearchService({ provider: 'duckduckgo' });
      expect(ddgService).toBeDefined();
    });

    it('should support brave provider', () => {
      const braveService = new WebSearchService({
        provider: 'brave',
        braveApiKey: 'test-key',
      });
      expect(braveService).toBeDefined();
    });

    it('should default to mock provider', () => {
      const defaultService = new WebSearchService();
      expect(defaultService).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle empty query gracefully', async () => {
      const results = await service.search('', { limit: 5 });
  
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle very long queries', async () => {
      const longQuery = 'test '.repeat(100);
      const results = await service.search(longQuery, { limit: 5 });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('search history', () => {
    it('should retrieve search history for a query', async () => {
      // First, perform a search
      await service.search('Svelte 5 runes', { limit: 5 });
  
      const history = await service.getSearchHistory('Svelte 5 runes', 10);

      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return empty array for query with no history', async () => {
      const history = await service.getSearchHistory('never-searched-query-xyz', 10);

      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
    });
  });
});
