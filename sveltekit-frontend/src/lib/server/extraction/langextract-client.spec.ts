// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const analyzeResponse = {
  entities: [
    { text: 'Jane Doe', label: 'person', confidence: 0.97, source: 'spacy' },
    { text: 'Acme Corp', label: 'organization', confidence: 0.92, source: 'spacy' },
  ],
  relationships: [{ subject: 'Jane Doe', predicate: 'works_for', object: 'Acme Corp' }],
  concepts: ['employment', 'corporate-affiliation'],
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('legacy extraction/langextract-client', () => {
  it('uses the HTTP sidecar path instead of subprocess execution', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      }
      if (url.endsWith('/analyze')) {
        expect(init?.method).toBe('POST');
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body.text).toBe('The defendant filed a motion to dismiss.');
        expect(body.document_id).toBe('evidence-123');
        expect(body.packet_key).toBe('evidence-123');
        return new Response(JSON.stringify(analyzeResponse), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const { LangExtractClient } = await import('$lib/server/extraction/langextract-client.js');
    const client = new LangExtractClient({ baseUrl: 'http://127.0.0.1:8095', timeoutMs: 5_000 });

    expect(await client.healthCheck()).toBe(true);

    const result = await client.extract({
      evidenceId: 'evidence-123',
      sourceType: 'plain_text',
      text: 'The defendant filed a motion to dismiss.',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.entities).toHaveLength(2);
    expect(result.entities[0]).toMatchObject({
      text: 'Jane Doe',
      type: 'person',
      confidence: 0.97,
    });
    expect(result.claims).toHaveLength(2);
    expect(result.events).toEqual([]);
    expect(result.crime_signals).toEqual([]);
    expect(result.summary).toContain('evidence-123');
  });

  it('fails closed when the sidecar is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));

    const { LangExtractClient } = await import('$lib/server/extraction/langextract-client.js');
    const client = new LangExtractClient({ baseUrl: 'http://127.0.0.1:8095', timeoutMs: 2_000 });

    expect(await client.healthCheck()).toBe(false);
    const result = await client.extract({
      evidenceId: 'evidence-999',
      sourceType: 'plain_text',
      text: 'Unreachable sidecar should fail open.',
    });

    expect(result.entities).toEqual([]);
    expect(result.claims).toEqual([]);
    expect(result.warnings[0]).toMatch(/unavailable/i);
  });
});
