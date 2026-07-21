import { describe, it, expect, beforeAll, vi } from 'vitest';
import { runLocalDeepResearch, streamLocalDeepResearchSynthesis } from '$lib/server/ldr/ldr-orchestrator';
import { searchViaSearXNG, fetchAndExtractText } from '$lib/server/ldr/web-search-client';

/**
 * LDR (Local Deep Research) Orchestrator Test Suite
 *
 * These tests verify the autonomous research pipeline:
 * 1. Web search via SearXNG
 * 2. Document extraction (fetch + text extraction)
 * 3. Gemma4 synthesis
 *
 * NOTE: These are integration tests and require:
 * - SearXNG running at SEARXNG_URL (or localhost:8888)
 * - Gemma4 llama-server running at :8090
 * - Network access (no mocks)
 */

describe('Local Deep Research (LDR) Orchestrator', () => {
  beforeAll(() => {
    // Set test environment variables
    process.env.SEARXNG_URL = process.env.SEARXNG_URL || 'http://127.0.0.1:8888';
    process.env.LLAMA_SERVER_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090/v1';
    process.env.LLAMA_SERVER_MODEL = process.env.LLAMA_SERVER_MODEL || 'gemma4-legal-iq4xs-direct.gguf';
  });

  describe('Web Search Client', () => {
    it.skip('should search via SearXNG and return results', async () => {
      // SKIP: Requires SearXNG running locally
      // To run: start SearXNG at localhost:8888, then remove .skip()

      const query = 'evidence admissibility FRE 401';
      const results = await searchViaSearXNG(query, 5);

      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('url');
        expect(results[0]).toHaveProperty('title');
        expect(results[0]).toHaveProperty('snippet');
        expect(results[0].source).toBe('searxng');
      }
    });

    it.skip('should fetch and extract text from a URL', async () => {
      // SKIP: Requires network access
      // To run: remove .skip() (will attempt to fetch from actual URLs)

      const url = 'https://www.law.cornell.edu/rules/fre/rule_401';
      const doc = await fetchAndExtractText(url);

      if (doc) {
        expect(doc).toHaveProperty('url', url);
        expect(doc).toHaveProperty('title');
        expect(doc).toHaveProperty('content');
        expect(doc.content.length).toBeGreaterThan(100);
        expect(doc.wordCount).toBeGreaterThan(50);
      }
    });
  });

  describe('LDR Orchestrator (Full Pipeline)', () => {
    it('should execute full LDR pipeline (search + extract + synthesis)', async () => {
      // ACTIVE: SearXNG + Gemma4 confirmed running

      const query = 'What is hearsay evidence under FRE 801?';

      const result = await runLocalDeepResearch(query, {
        maxWebResults: 5,
        maxDocumentsToFetch: 3,
        temperature: 0.3
      });

      expect(result).toHaveProperty('synthesis');
      expect(result).toHaveProperty('sources');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('durationMs');

      expect(result.synthesis.length).toBeGreaterThan(0);
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.durationMs).toBeGreaterThan(0);

      console.log(`[Test] LDR Pipeline Results:`);
      console.log(`  Duration: ${result.durationMs}ms`);
      console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`  Sources: ${result.sources.length}`);
      console.log(`  Synthesis Length: ${result.synthesis.length} chars`);
    });

    it('should handle missing query gracefully', async () => {
      const result = await runLocalDeepResearch('', {
        maxWebResults: 5,
        timeout: 5000
      });

      expect(result.error).toBeDefined();
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should handle Gemma4 unavailability gracefully', async () => {
      // Test with invalid Gemma4 URL
      const originalUrl = process.env.LLAMA_SERVER_URL;
      process.env.LLAMA_SERVER_URL = 'http://127.0.0.1:9999/v1'; // Invalid port

      const result = await runLocalDeepResearch('test query', {
        maxWebResults: 1,
        timeout: 2000
      });

      // Should still have some result, but with low confidence
      expect(result).toBeDefined();
      expect(result.durationMs).toBeGreaterThan(0);

      // Restore
      process.env.LLAMA_SERVER_URL = originalUrl;
    });
  });

  describe('Streaming Synthesis', () => {
    it('should stream Gemma4 synthesis chunks', async () => {
      // ACTIVE: Gemma4 confirmed running

      const query = 'Evidence admissibility under common law';
      const chunks: string[] = [];

      const result = await streamLocalDeepResearchSynthesis(
        query,
        (chunk) => {
          chunks.push(chunk);
        },
        {
          maxWebResults: 3,
          maxDocumentsToFetch: 2,
          temperature: 0.3
        }
      );

      expect(chunks.length).toBeGreaterThan(0);
      expect(result.synthesis).toBeDefined();
      expect(chunks.join('')).toBe(result.synthesis);

      console.log(`[Test] Streamed ${chunks.length} chunks, total ${result.synthesis.length} chars`);
    });
  });

  describe('Confidence Scoring', () => {
    it('should calculate confidence between 0 and 1', async () => {
      const result = await runLocalDeepResearch('test', {
        maxWebResults: 1,
        maxDocumentsToFetch: 1,
        temperature: 0.3,
        timeout: 2000
      });

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Error Handling', () => {
    it('should timeout gracefully if pipeline takes too long', async () => {
      const result = await runLocalDeepResearch('query', {
        timeout: 100 // Very short timeout
      });

      expect(result).toBeDefined();
      expect(result.durationMs).toBeGreaterThan(0);
      // Result may have error depending on which stage times out
    });

    it('should handle network errors gracefully', async () => {
      // Override SearXNG URL to invalid address
      const originalUrl = process.env.SEARXNG_URL;
      process.env.SEARXNG_URL = 'http://127.0.0.1:9888'; // Invalid

      const result = await runLocalDeepResearch('test query');

      expect(result).toBeDefined();
      // Should return error result, not throw
      expect(!!result.error || result.confidence < 0.5).toBe(true);

      process.env.SEARXNG_URL = originalUrl;
    });
  });
});

/**
 * Manual Test Commands (run from sveltekit-frontend/):
 *
 * 1. Start SearXNG (if not running):
 *    docker run -d -p 8888:8888 searxng/searxng
 *
 * 2. Verify Gemma4 is running:
 *    curl http://127.0.0.1:8090/v1/models
 *
 * 3. Run specific tests:
 *    npm test -- tests/ldr-orchestrator.spec.ts --reporter=verbose
 *
 * 4. Run integration tests (remove .skip()):
 *    npm test -- tests/ldr-orchestrator.spec.ts --reporter=verbose --no-coverage
 *
 * 5. Test LDR API endpoint via curl:
 *    curl "http://127.0.0.1:5173/api/ldr/research?q=evidence%20admissibility"
 *
 *    Or with streaming:
 *    curl -X POST http://127.0.0.1:5173/api/ldr/research \
 *      -H "Content-Type: application/json" \
 *      -d '{"query":"What is FRE 401?","maxResults":10}'
 */
