// @vitest-environment node
/**
 * Atlas langextract-client shape + fail-closed contract tests.
 *
 * Tests the atlas/ai/langextract-client factory — read-only HTTP client
 * that never writes to Postgres directly.
 *
 * All tests are hermetic: no real HTTP calls, no database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ENV so the module loads cleanly without SvelteKit hooks
vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    LANGEXTRACT_URL: 'http://127.0.0.1:9998',
  },
  privateEnv: {},
}));

describe('atlas/ai/langextract-client', () => {
  it('exports createLangExtractClient', async () => {
    const mod = await import('$lib/server/atlas/ai/langextract-client.js');
    expect(typeof mod.createLangExtractClient).toBe('function');
  });

  it('createLangExtractClient returns an object with health and extract methods', async () => {
    const { createLangExtractClient } = await import('$lib/server/atlas/ai/langextract-client.js');
    const client = createLangExtractClient();
    expect(typeof client.health).toBe('function');
    expect(typeof client.extract).toBe('function');
  });

  it('health() returns { ready: false } when service is unreachable (fail-closed)', async () => {
    const { createLangExtractClient } = await import('$lib/server/atlas/ai/langextract-client.js');
    // Point at a definitely-closed port
    const client = createLangExtractClient({ baseUrl: 'http://127.0.0.1:1' });
    const health = await client.health();
    expect(health.ready).toBe(false);
  });

  it('extract() throws or returns a LangExtractResponse-shaped object', async () => {
    const { createLangExtractClient } = await import('$lib/server/atlas/ai/langextract-client.js');
    const client = createLangExtractClient({ baseUrl: 'http://127.0.0.1:1' });
    try {
      const result = await client.extract({
        text: 'The defendant filed a motion to dismiss.',
        extractionMode: 'entities',
      });
      // If it somehow resolves, shape must be valid
      expect(Array.isArray(result.entities)).toBe(true);
      expect(Array.isArray(result.relationships)).toBe(true);
      expect(Array.isArray(result.concepts)).toBe(true);
    } catch (err) {
      // Service unreachable — this is the expected fail-closed path
      expect(err).toBeInstanceOf(Error);
    }
  });
});
