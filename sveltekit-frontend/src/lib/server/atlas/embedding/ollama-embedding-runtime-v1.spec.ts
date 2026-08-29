import { describe, expect, it } from 'vitest';
import { createOllamaEmbeddingRuntimeV1 } from './ollama-embedding-runtime-v1.js';
import type { EmbeddingContextPlanV1 } from './embedding-context-plan-v1.js';

const plan: EmbeddingContextPlanV1 = {
  schema: 'atlas.embedding-context-plan.v1',
  planRevision: 'plan:v1',
  representationId: 'semantic_768',
  representationRevision: 'semantic:v1',
  modelRevision: 'embeddinggemma:latest',
  tokenizerRevision: 'tokenizer:v1',
  promptRevision: 'prompt:v1',
  role: 'RETRIEVAL_QUERY',
  text: 'task: search result | query: probe',
  title: null,
  inputTextChecksum: 'sha256:' + 'a'.repeat(64),
  renderedInput: 'task: search result | query: probe',
  renderedInputChecksum: 'sha256:' + 'c'.repeat(64),
  estimatedTokens: 8,
  poolingPolicy: 'MEAN',
  normalizationPolicy: 'L2',
  sourceRef: null,
  sourceRevision: null,
  workspaceRevision: null,
  packetKey: null,
  candidateOrdinal: null,
  canonicalAuthority: false,
  planChecksum: 'sha256:' + 'b'.repeat(64),
};

describe('Ollama embedding runtime v1', () => {
  it('adapts a normalized 768-D Ollama response without writes', async () => {
    const vector = Array.from({ length: 768 }, () => 1 / Math.sqrt(768));
    const runtime = createOllamaEmbeddingRuntimeV1({
      endpoint: 'http://embedding.test/',
      model: 'embeddinggemma:latest',
      fetchImpl: async (url, init) => {
        expect(url).toBe('http://embedding.test/api/embed');
        expect(init?.method).toBe('POST');
        expect(String(init?.body)).toContain('embeddinggemma:latest');
        return new Response(JSON.stringify({ embeddings: [vector] }), { status: 200 });
      },
    });

    const result = await runtime.embed(plan);
    expect(result.executorId).toBe('OLLAMA');
    expect(result.vector).toHaveLength(768);
    expect(result.outputChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
