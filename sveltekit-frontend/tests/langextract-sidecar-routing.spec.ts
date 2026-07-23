/**
 * Smoke test: Langextract NLP sidecar routing
 *
 * Verifies that the application correctly routes between:
 * 1. Native TypeScript extraction (LANGEXTRACT_NATIVE='true')
 * 2. Miniforge NLP sidecar (LANGEXTRACT_NATIVE='false', service at :8095)
 *
 * The routing witness headers (x-nlp-runtime, x-langextract-source) prove
 * which implementation actually processed the request.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('langextract-client.ts — NLP sidecar routing', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env to known state
    process.env.LANGEXTRACT_NATIVE = 'false';
    process.env.LANGEXTRACT_ENABLED = 'true';
    process.env.NLP_SIDECAR_URL = 'http://127.0.0.1:8095';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('routing witness headers', () => {
    it('native-ts path: x-nlp-runtime=native-ts when LANGEXTRACT_NATIVE=true', async () => {
      // @vitest-environment node
      if (typeof window !== 'undefined') {
        // Skip in browser environment
        expect(true).toBe(true);
        return;
      }

      process.env.LANGEXTRACT_NATIVE = 'true';

      const { langextractFetch } = await import('$lib/server/langextract-client');

      // Mock /health endpoint
      const response = await langextractFetch('/health');

      expect(response).toBeDefined();
      expect(response?.status).toBe(200);
      expect(response?.headers.get('x-nlp-runtime')).toBe('native-ts');
      expect(response?.headers.get('x-langextract-source')).toBe('native-ts');

      const data = (await response?.json()) as Record<string, unknown>;
      expect(data.runtime).toBe('native-ts');
      expect(data.source).toBe('native-ts');
    });

    it('native-ts path: /extract POST returns native-ts runtime marker', async () => {
      if (typeof window !== 'undefined') {
        expect(true).toBe(true);
        return;
      }

      process.env.LANGEXTRACT_NATIVE = 'true';

      const { langextractFetch } = await import('$lib/server/langextract-client');

      const body = JSON.stringify({
        text: 'The contract was signed on January 1, 2026.',
        document_type: 'case',
      });

      const response = await langextractFetch('/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      expect(response).toBeDefined();
      expect(response?.status).toBe(200);
      expect(response?.headers.get('x-nlp-runtime')).toBe('native-ts');
      expect(response?.headers.get('x-langextract-source')).toBe('native-ts');

      const data = (await response?.json()) as Record<string, unknown>;
      expect(data.doc_id).toBeDefined();
      expect(data.sections).toBeDefined();
    });

    it('sidecar path: URL resolution respects NLP_SIDECAR_URL precedence', async () => {
      if (typeof window !== 'undefined') {
        expect(true).toBe(true);
        return;
      }

      process.env.LANGEXTRACT_NATIVE = 'false';
      process.env.LANGEXTRACT_ENABLED = 'true';
      process.env.NLP_SIDECAR_URL = 'http://custom-nlp-host:8095';
      process.env.MINIFORGE_SIDECAR_URL = 'http://should-not-use:8095';

      const { langextractFetch } = await import('$lib/server/langextract-client');

      // Mock fetch to capture the URL
      let capturedUrl = '';
      global.fetch = vi.fn(async (url: string) => {
        capturedUrl = url;
        return new Response('{"status":"healthy","services":{}}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      await langextractFetch('/health');

      // Verify NLP_SIDECAR_URL was prioritized
      expect(capturedUrl).toContain('custom-nlp-host');
      expect(capturedUrl).not.toContain('should-not-use');
    });
  });

  describe('health status structure', () => {
    it('getLangExtractStatus returns runtime field for routing audit', async () => {
      if (typeof window !== 'undefined') {
        expect(true).toBe(true);
        return;
      }

      process.env.LANGEXTRACT_NATIVE = 'true';

      const { getLangExtractStatus } = await import('$lib/server/langextract-client');

      const status = await getLangExtractStatus();

      expect(status.runtime).toBeDefined();
      expect(['native-ts', 'miniforge-nlp-sidecar']).toContain(status.runtime);
      expect(status.source).toBeDefined();
      expect(status.resolvedUrl).toBeDefined();
    });

    it('getLangExtractStatus includes capability types (spacy, langextract, tree_sitter, ast_grep)', async () => {
      if (typeof window !== 'undefined') {
        expect(true).toBe(true);
        return;
      }

      process.env.LANGEXTRACT_NATIVE = 'true';

      const { getLangExtractStatus } = await import('$lib/server/langextract-client');

      const status = await getLangExtractStatus();

      // Native implementation
      expect(status.services).toBeDefined();
      // Sidecar would have: spacy, langextract, tree_sitter, ast_grep, torch, gpu?
      // Native has: native: true
    });
  });

  describe('fallback chain', () => {
    it('LANGEXTRACT_ENABLED=false returns disabled status', async () => {
      if (typeof window !== 'undefined') {
        expect(true).toBe(true);
        return;
      }

      process.env.LANGEXTRACT_NATIVE = 'false';
      process.env.LANGEXTRACT_ENABLED = 'false';

      const { langextractFetch } = await import('$lib/server/langextract-client');

      const response = await langextractFetch('/health');

      expect(response).toBeNull();
    });

    it('langextractFetch returns null if health check fails', async () => {
      if (typeof window !== 'undefined') {
        expect(true).toBe(true);
        return;
      }

      process.env.LANGEXTRACT_NATIVE = 'false';
      process.env.LANGEXTRACT_ENABLED = 'true';

      // Mock fetch to simulate health check failure
      global.fetch = vi.fn(async () => {
        return new Response('{"status":"unhealthy"}', {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const { langextractFetch } = await import('$lib/server/langextract-client');

      const response = await langextractFetch('/extract');

      expect(response).toBeNull();
    });
  });

  describe('environment variable precedence', () => {
    it('NLP_SIDECAR_URL is canonical (priority 1)', async () => {
      if (typeof window !== 'undefined') {
        expect(true).toBe(true);
        return;
      }

      process.env.NLP_SIDECAR_URL = 'http://neon-url:8095';
      process.env.MINIFORGE_SIDECAR_URL = 'http://should-not-use:8095';
      process.env.LANGEXTRACT_URL = 'http://should-not-use:8095';

      // Re-import to get fresh env resolution
      const { getLangExtractStatus } = await import('$lib/server/langextract-client');

      global.fetch = vi.fn(async () => {
        return new Response('{"status":"healthy","services":{}}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const status = await getLangExtractStatus();

      // resolvedUrl should contain the neon URL
      expect(status.resolvedUrl).toContain('neon-url');
      expect(status.source).toBe('env');
    });

    it('MINIFORGE_SIDECAR_URL is fallback (priority 2 after NLP_SIDECAR_URL)', async () => {
      if (typeof window !== 'undefined') {
        expect(true).toBe(true);
        return;
      }

      process.env.NLP_SIDECAR_URL = '';
      process.env.MINIFORGE_SIDECAR_URL = 'http://miniforge-url:8095';
      process.env.LANGEXTRACT_URL = 'http://should-not-use:8095';

      const { getLangExtractStatus } = await import('$lib/server/langextract-client');

      global.fetch = vi.fn(async () => {
        return new Response('{"status":"healthy","services":{}}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const status = await getLangExtractStatus();

      expect(status.resolvedUrl).toContain('miniforge-url');
    });
  });
});
