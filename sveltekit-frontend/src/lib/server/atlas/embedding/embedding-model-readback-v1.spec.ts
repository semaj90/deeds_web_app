import { describe, expect, it, vi } from 'vitest';

import { readOllamaModelTagDigestV1 } from './embedding-model-readback-v1.js';

const digest = 'a'.repeat(64);

describe('Ollama model tag readback V1', () => {
  it('returns exact tag digest as daemon-reported, non-authoritative revision evidence', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      models: [
        { name: 'unrelated:latest', digest: 'b'.repeat(64) },
        { name: 'embeddinggemma:latest', digest },
      ],
    }), { status: 200 }));

    const result = await readOllamaModelTagDigestV1({
      endpoint: 'http://ollama.internal:11434/',
      modelId: 'embeddinggemma:latest',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith('http://ollama.internal:11434/api/tags', expect.objectContaining({ method: 'GET' }));
    expect(result).toEqual({
      schema: 'atlas.ollama-model-tag-readback.v1',
      modelId: 'embeddinggemma:latest',
      modelRevision: `sha256:${digest}`,
      readbackStatus: 'OLLAMA_TAG_DIGEST_READBACK',
      authority: 'DAEMON_REPORTED_NOT_ARTIFACT_VERIFIED',
      canonicalAuthority: false,
    });
  });

  it('refuses absent or ambiguous model tags', async () => {
    const noMatch = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 }));
    await expect(readOllamaModelTagDigestV1({ endpoint: 'http://ollama.internal', modelId: 'embeddinggemma:latest', fetchImpl: noMatch }))
      .rejects.toThrow('OLLAMA_MODEL_READBACK_MODEL_NOT_UNIQUE');

    const duplicate = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      models: [
        { name: 'embeddinggemma:latest', digest },
        { model: 'embeddinggemma:latest', digest },
      ],
    }), { status: 200 }));
    await expect(readOllamaModelTagDigestV1({ endpoint: 'http://ollama.internal', modelId: 'embeddinggemma:latest', fetchImpl: duplicate }))
      .rejects.toThrow('OLLAMA_MODEL_READBACK_MODEL_NOT_UNIQUE');
  });

  it('rejects malformed digest, bad response and credential-bearing endpoints', async () => {
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      models: [{ name: 'embeddinggemma:latest', digest: 'mutable-tag' }],
    }), { status: 200 }));
    await expect(readOllamaModelTagDigestV1({ endpoint: 'http://ollama.internal', modelId: 'embeddinggemma:latest', fetchImpl: malformed }))
      .rejects.toThrow('OLLAMA_MODEL_READBACK_DIGEST_INVALID');

    const badPayload = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ models: null }), { status: 200 }));
    await expect(readOllamaModelTagDigestV1({ endpoint: 'http://ollama.internal', modelId: 'embeddinggemma:latest', fetchImpl: badPayload }))
      .rejects.toThrow('OLLAMA_MODEL_READBACK_MODELS_INVALID');

    const unavailable = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));
    await expect(readOllamaModelTagDigestV1({ endpoint: 'http://ollama.internal', modelId: 'embeddinggemma:latest', fetchImpl: unavailable }))
      .rejects.toThrow('OLLAMA_MODEL_READBACK_HTTP_503');

    await expect(readOllamaModelTagDigestV1({ endpoint: 'http://user:secret@ollama.internal', modelId: 'embeddinggemma:latest', fetchImpl: unavailable }))
      .rejects.toThrow('OLLAMA_MODEL_READBACK_ENDPOINT_INVALID');
  });
});
