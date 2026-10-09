import { afterEach, describe, expect, it, vi } from 'vitest';

describe('tryEmbedCanonical', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('prefers the local api embed lane before any fallback', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('http://127.0.0.1:5173/api/embed');
      return new Response(JSON.stringify({
        embedding: new Array(768).fill(0.25),
        model: 'embeddinggemma:latest',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    vi.stubGlobal('fetch', fetchMock);

    const { tryEmbedCanonical } = await import('./canonical-embed.js');
    const result = await tryEmbedCanonical('semantic retrieval proof', {
      baseUrl: 'http://127.0.0.1:5173',
      model: 'embeddinggemma:latest',
    });

    expect(result).not.toBeNull();
    expect(result?.source).toBe('api-embed');
    expect(result?.model).toBe('embeddinggemma:latest');
    expect(result?.embedding).toHaveLength(768);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends a body the /api/embed route accepts ({ text, model: "embeddinggemma" }), even for a tagged model name', async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ embedding: new Array(768).fill(0.25) }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { tryEmbedCanonical } = await import('./canonical-embed.js');
    await tryEmbedCanonical('semantic retrieval proof', {
      baseUrl: 'http://127.0.0.1:5173',
      model: 'embeddinggemma:latest',
    });

    expect(sentBody).toEqual({ text: 'semantic retrieval proof', model: 'embeddinggemma' });
  });

  it('fails closed when the canonical route fails: never an ONNX or pseudo vector', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    const onnx = { isOnnxEmbedAvailable: vi.fn(async () => true), tryEmbedOnnx: vi.fn(async () => new Array(768).fill(0.1)) };
    vi.doMock('./onnx-embed.js', () => onnx);
    const { tryEmbedCanonical } = await import('./canonical-embed.js');
    const result = await tryEmbedCanonical('x', { baseUrl: 'http://127.0.0.1:5173' });
    expect(result).toBeNull();
    expect(onnx.tryEmbedOnnx).not.toHaveBeenCalled();
    vi.doUnmock('./onnx-embed.js');
  });

  it('rejects the route\'s unauthenticated 200 all-zero vector', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ embedding: new Array(768).fill(0) }), { status: 200 })));
    const { tryEmbedCanonical } = await import('./canonical-embed.js');
    expect(await tryEmbedCanonical('x', { baseUrl: 'http://127.0.0.1:5173' })).toBeNull();
  });

  it('keeps ONNX reachable only as an explicit, non-canonical challenger', async () => {
    vi.doMock('./onnx-embed.js', () => ({
      isOnnxEmbedAvailable: vi.fn(async () => true),
      tryEmbedOnnx: vi.fn(async () => new Array(768).fill(0.1)),
      getOnnxEmbedLocalModelPath: () => '/models/embeddinggemma_300m_onnx/model.onnx',
    }));
    vi.resetModules();
    const { tryEmbedOnnxChallenger } = await import('./canonical-embed.js');
    const result = await tryEmbedOnnxChallenger('x');
    expect(result?.embedding).toHaveLength(768);
    expect(result).toMatchObject({ canonicalAuthority: false, promotionEligible: false, provider: 'onnx-local-cpu' });
    expect(result).not.toHaveProperty('representationId');
    vi.doUnmock('./onnx-embed.js');
  });
});

describe('embedSemantic768Canonical', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects a non-normalized 768-vector before it can enter canonical retrieval', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/tokenize')) {
        return new Response(JSON.stringify({ tokens: [1, 2] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        model: 'embeddinggemma',
        data: [{ embedding: new Array(768).fill(0.25) }],
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { embedSemantic768Canonical } = await import('./canonical-embed.js');
    await expect(embedSemantic768Canonical('strict semantic proof', {
      model: 'embeddinggemma',
      modelArtifactRevision: 'artifact-revision',
      tokenizerRevision: 'tokenizer-revision',
      inputPolicyRevision: 'input-policy-revision',
      baseUrl: 'http://127.0.0.1:8081',
    })).rejects.toThrow('SEMANTIC_768_NOT_L2_NORMALIZED');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns exact runtime revisions and checksums without inventing a representation revision', async () => {
    const vector = new Array(768).fill(1 / Math.sqrt(768));
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/tokenize')) {
        return new Response(JSON.stringify({ tokens: [1, 2, 3] }), { status: 200 });
      }
      return new Response(JSON.stringify({ model: 'embeddinggemma', data: [{ embedding: vector }] }), { status: 200 });
    }));
    const { embedSemantic768Canonical } = await import('./canonical-embed.js');
    const result = await embedSemantic768Canonical('exact query bytes', {
      model: 'embeddinggemma',
      modelArtifactRevision: 'artifact-sha256:abc',
      tokenizerRevision: 'tokenizer-r1',
      inputPolicyRevision: 'input-policy-r1',
      baseUrl: 'http://127.0.0.1:8081',
    });

    expect(result).toMatchObject({
      representationId: 'semantic_768',
      representationRevision: null,
      modelArtifactRevision: 'artifact-sha256:abc',
      tokenizerRevision: 'tokenizer-r1',
      inputPolicyRevision: 'input-policy-r1',
      admittedTokenCount: 3,
      qualification: 'REPRESENTATION_REVISION_UNQUALIFIED',
    });
    expect(result.inputChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.outputChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
