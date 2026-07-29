// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunLocalDeepResearch = vi.fn();
const mockStreamLocalDeepResearchSynthesis = vi.fn();

vi.mock('$lib/server/ldr/ldr-orchestrator', () => ({
  runLocalDeepResearch: (...args: unknown[]) => mockRunLocalDeepResearch(...args),
  streamLocalDeepResearchSynthesis: (...args: unknown[]) => mockStreamLocalDeepResearchSynthesis(...args),
}));

describe('/api/ldr/research', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRunLocalDeepResearch.mockResolvedValue({
      synthesis: 'Gemma synthesis for LDR.',
      sources: [
        { url: 'https://example.com/a', title: 'Example A' },
        { url: 'https://example.com/b', title: 'Example B' },
      ],
      confidence: 0.87,
      durationMs: 42,
      stage: 'synthesis',
    });
    mockStreamLocalDeepResearchSynthesis.mockResolvedValue({
      synthesis: 'Streamed Gemma synthesis for LDR.',
      sources: [{ url: 'https://example.com/a', title: 'Example A' }],
      confidence: 0.81,
      durationMs: 24,
      stage: 'synthesis',
    });
  });

  it('returns an OKF block in the synchronous response', async () => {
    const { GET } = await import('./+server.js');
    const response = await GET({
      url: new URL('http://localhost/api/ldr/research?q=trace mcp okf pipeline'),
      locals: { user: { id: 'u1' } },
    } as any);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.query).toBe('trace mcp okf pipeline');
    expect(body.okf).toBeDefined();
    expect(body.okf.keyword_corpus.keywords.length).toBeGreaterThan(0);
    expect(body.okf.domain_classification.classifier_version).toBe('domain-classifier-v1');
    expect(body.okf.semantic_ontology.extraction_lane).toBe('ldr');
    expect(body.okf.nlp.middleware).toContain('langextract');
    expect(body.okf.nlp.middleware).toContain('mixedbread');
    expect(body.okf.nlp.source_engines).toContain('ldr');
  });

  it('includes OKF in the streaming completion event', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/ldr/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'trace mcp okf pipeline', maxResults: 3, maxDocs: 2, temperature: 0.1 }),
    });

    const response = await POST({
      request,
      locals: { user: { id: 'u1' } },
    } as any);

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"type":"complete"');
    expect(text).toContain('"okf"');
    expect(text).toContain('"keyword_corpus"');
    expect(mockStreamLocalDeepResearchSynthesis).toHaveBeenCalledWith(
      'trace mcp okf pipeline',
      expect.any(Function),
      expect.objectContaining({
        maxWebResults: 3,
        maxDocumentsToFetch: 2,
        temperature: 0.1,
      })
    );
  });
});
