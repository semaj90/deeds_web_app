// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    LANGEXTRACT_URL: 'http://127.0.0.1:9998',
    MINIFORGE_SIDECAR_URL: 'http://127.0.0.1:9998',
  },
  privateEnv: {},
}));

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('atlas/ai/langextract-client', () => {
  it('exports createLangExtractClient', async () => {
    const mod = await import('$lib/server/atlas/ai/langextract-client.js');
    expect(typeof mod.createLangExtractClient).toBe('function');
  });

  it('creates a client with health, analyze, and extract aliases', async () => {
    const { createLangExtractClient } = await import('$lib/server/atlas/ai/langextract-client.js');
    const client = createLangExtractClient();
    expect(typeof client.health).toBe('function');
    expect(typeof client.analyze).toBe('function');
    expect(typeof client.extract).toBe('function');
  });

  it('health() calls the sidecar /health route and computes ready', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('/health');
      return new Response(
        JSON.stringify({
          status: 'ok',
          model: 'miniforge-nlp-sidecar',
          capabilities: { langextract: true },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { createLangExtractClient } = await import('$lib/server/atlas/ai/langextract-client.js');
    const client = createLangExtractClient('http://127.0.0.1:9998');
    const health = await client.health();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(health.ready).toBe(true);
    expect(health.status).toBe('ok');
    expect(health.model).toBe('miniforge-nlp-sidecar');
  });

  it('analyze() posts to /analyze and preserves the full sidecar response', async () => {
    const responsePayload = {
      document_id: 'doc-1',
      source_type: 'plain_text',
      extraction_mode: 'full',
      entities: [{ text: 'Jane Doe', label: 'person', confidence: 0.97 }],
      relationships: [{ subject: 'Jane Doe', predicate: 'works_for', object: 'Acme Corp' }],
      concepts: ['employment'],
      chunks: [{ kind: 'paragraph', text: 'Example', start: 0, end: 7 }],
      features: [{ kind: 'symbol', name: 'Example', description: 'demo', source: 'tree-sitter' }],
      metadata: { source: 'unit-test' },
      capabilities: { langextract: true },
      processing_time_ms: 42,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/analyze');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      expect(body).toMatchObject({
        text: 'The defendant filed a motion to dismiss.',
        source_type: 'plain_text',
        extraction_mode: 'full',
        document_id: 'doc-1',
        source_ref: 'case-7',
        packet_key: 'packet-7',
        language: 'en',
      });
      expect(body.max_chars).toBe(2048);
      return new Response(JSON.stringify(responsePayload), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { createLangExtractClient } = await import('$lib/server/atlas/ai/langextract-client.js');
    const client = createLangExtractClient('http://127.0.0.1:9998');
    const result = await client.analyze({
      text: 'The defendant filed a motion to dismiss.',
      source_type: 'plain_text',
      extraction_mode: 'full',
      document_id: 'doc-1',
      source_ref: 'case-7',
      packet_key: 'packet-7',
      language: 'en',
      max_chars: 2048,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject(responsePayload);
  });

  it('extract() remains a compatibility alias for analyze()', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('/analyze');
      return new Response(
        JSON.stringify({
          document_id: 'doc-2',
          source_type: 'plain_text',
          extraction_mode: 'entities',
          entities: [],
          relationships: [],
          concepts: [],
          metadata: {},
          processing_time_ms: 12,
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { createLangExtractClient } = await import('$lib/server/atlas/ai/langextract-client.js');
    const client = createLangExtractClient('http://127.0.0.1:9998');
    const result = await client.extract({
      text: 'Short text',
      extraction_mode: 'entities',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.document_id).toBe('doc-2');
  });
});
