// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    MINIFORGE_SIDECAR_URL: 'http://127.0.0.1:9997',
    LANGEXTRACT_URL: '',
  },
}));

describe('miniforge-nlp-sidecar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exports a client factory', async () => {
    const mod = await import('./miniforge-nlp-sidecar.js');
    expect(typeof mod.createMiniforgeNlpSidecarClient).toBe('function');
  });

  it('builds health and analyze requests against the miniforge base url', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({ status: 'ok', model: 'miniforge-nlp-sidecar', capabilities: { spacy: true } }), { status: 200 });
      }
      if (url.endsWith('/analyze')) {
        return new Response(JSON.stringify({
          document_id: 'doc-1',
          source_type: 'codebase',
          extraction_mode: 'full',
          entities: [],
          relationships: [],
          concepts: ['tree-sitter'],
          chunks: [],
          features: [],
          metadata: {},
          capabilities: { spacy: true, langextract: true, tree_sitter: true, ast_grep: true, torch: false },
          processing_time_ms: 5,
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { createMiniforgeNlpSidecarClient } = await import('./miniforge-nlp-sidecar.js');
    const client = createMiniforgeNlpSidecarClient();

    const health = await client.health();
    expect(health.ready).toBe(true);

    const analysis = await client.analyze({
      text: 'export function hello() { return 1; }',
      sourceType: 'codebase',
      extractionMode: 'full',
      documentId: 'doc-1',
    });

    expect(analysis.document_id).toBe('doc-1');
    expect(Array.isArray(analysis.entities)).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();
  });
});
