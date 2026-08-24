import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestLangExtractAnalyze, requestLangExtractHealth } from './langextract-transport.js';

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const response = {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'OK',
    json: async () => body,
  } as Response;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

const VALID_ANALYZE_RESPONSE = {
  document_id: 'doc-1',
  source_type: 'codebase',
  extraction_mode: 'full',
  entities: [{ text: 'foo', label: 'CODE_SYMBOL' }],
  relationships: [],
  concepts: ['foo'],
  chunks: [{ kind: 'function_declaration', text: 'foo', start: 0, end: 10, symbol: 'foo' }],
  metadata: { source_ref: 'x.ts' },
  capabilities: { treesitter_chunker: true },
  processing_time_ms: 5,
  // Real sidecar fields the TS interface doesn't declare — must not fail validation.
  pass_results: [],
  control5: null,
};

describe('CHUNK0: langextract-transport response validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts a valid /analyze response and returns typed data through', async () => {
    mockFetchOnce(VALID_ANALYZE_RESPONSE);
    const result = await requestLangExtractAnalyze({ text: 'x', source_type: 'codebase' });
    expect(result.document_id).toBe('doc-1');
    expect(result.chunks?.[0].kind).toBe('function_declaration');
  });

  it('rejects an /analyze response with the wrong shape instead of trusting it', async () => {
    mockFetchOnce({ document_id: 123, entities: 'not-an-array' });
    await expect(requestLangExtractAnalyze({ text: 'x' })).rejects.toThrow(/schema validation/);
  });

  it('rejects an /analyze response missing required fields', async () => {
    mockFetchOnce({ document_id: 'doc-1' });
    await expect(requestLangExtractAnalyze({ text: 'x' })).rejects.toThrow(/schema validation/);
  });

  it('still throws the original HTTP error for a non-ok response, before schema validation runs', async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    await expect(requestLangExtractAnalyze({ text: 'x' })).rejects.toThrow(/failed: 500/);
  });

  it('accepts a valid /health response', async () => {
    mockFetchOnce({ status: 'ok', capabilities: { treesitter_chunker: true } });
    const result = await requestLangExtractHealth();
    expect(result.status).toBe('ok');
  });

  it('rejects a malformed /health response', async () => {
    mockFetchOnce({ capabilities: 'not-an-object' });
    await expect(requestLangExtractHealth()).rejects.toThrow(/schema validation/);
  });
});
