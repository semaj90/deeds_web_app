import { describe, expect, it } from 'vitest';
import {
  EMBEDDINGGEMMA2_CHALLENGER_EXECUTOR_ID,
  EMBEDDINGGEMMA2_CHALLENGER_MODEL,
  EMBEDDINGGEMMA2_CHALLENGER_MODEL_REVISION,
  createEmbeddingGemma2ChallengerExecutorV1,
} from './embeddinggemma2-challenger-executor-v1.js';
import { embedEmbeddingGemmaTaskV1 } from './embeddinggemma-task-runtime-v1.js';

const ENDPOINT = 'http://ollama.test';

function stubFetch(embedding: number[] | null, status = 200) {
  const calls: { url: string; body: unknown }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
    if (status !== 200) return new Response('nope', { status });
    return new Response(JSON.stringify({ embeddings: embedding === null ? [] : [embedding] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const unit768 = (value = 1) => Array.from({ length: 768 }, (_, i) => (i === 0 ? value : 0));

describe('EmbeddingGemma 2 challenger executor (Ollama Q8_0)', () => {
  it('posts the challenger model name to /api/embed', async () => {
    const { fetchImpl, calls } = stubFetch(unit768());
    const executor = createEmbeddingGemma2ChallengerExecutorV1({ endpoint: ENDPOINT, fetchImpl });
    await executor.embedNative768('function graphBFS(rowPtr)');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${ENDPOINT}/api/embed`);
    expect(calls[0].body).toEqual({ model: EMBEDDINGGEMMA2_CHALLENGER_MODEL, input: ['function graphBFS(rowPtr)'] });
  });

  it('returns a normalized 768-dimension Float32Array with challenger identity', async () => {
    const raw = Array.from({ length: 768 }, (_, i) => (i % 7) - 3);
    const { fetchImpl } = stubFetch(raw);
    const executor = createEmbeddingGemma2ChallengerExecutorV1({ endpoint: ENDPOINT, fetchImpl });
    const result = await executor.embedNative768('x');
    expect(result.vector).toBeInstanceOf(Float32Array);
    expect(result.vector.length).toBe(768);
    let norm = 0;
    for (const v of result.vector) norm += v * v;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 5);
    expect(result.executor).toBe(EMBEDDINGGEMMA2_CHALLENGER_EXECUTOR_ID);
    expect(result.modelRevision).toBe(EMBEDDINGGEMMA2_CHALLENGER_MODEL_REVISION);
    expect(result.modelRevision).toContain('sha256:6f1bd4ac');
    expect(result.execMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects a wrong dimension instead of projecting or padding it', async () => {
    const { fetchImpl } = stubFetch(Array.from({ length: 512 }, () => 0.1));
    const executor = createEmbeddingGemma2ChallengerExecutorV1({ endpoint: ENDPOINT, fetchImpl });
    await expect(executor.embedNative768('x')).rejects.toThrow('DIMENSION_MISMATCH expected=768 got=512');
  });

  it('rejects non-finite values and zero vectors', async () => {
    // JSON cannot carry NaN; a null entry is the realistic bad value and must not become 0.
    const withNull: (number | null)[] = unit768();
    withNull[5] = null;
    await expect(
      createEmbeddingGemma2ChallengerExecutorV1({ endpoint: ENDPOINT, fetchImpl: stubFetch(withNull as unknown as number[]).fetchImpl }).embedNative768('x'),
    ).rejects.toThrow('NONFINITE index=5');
    await expect(
      createEmbeddingGemma2ChallengerExecutorV1({ endpoint: ENDPOINT, fetchImpl: stubFetch(Array(768).fill(0)).fetchImpl }).embedNative768('x'),
    ).rejects.toThrow('ZERO_NORM');
  });

  it('fails closed on HTTP errors and missing vectors', async () => {
    await expect(
      createEmbeddingGemma2ChallengerExecutorV1({ endpoint: ENDPOINT, fetchImpl: stubFetch(null, 500).fetchImpl }).embedNative768('x'),
    ).rejects.toThrow('HTTP_500');
    await expect(
      createEmbeddingGemma2ChallengerExecutorV1({ endpoint: ENDPOINT, fetchImpl: stubFetch(null).fetchImpl }).embedNative768('x'),
    ).rejects.toThrow('VECTOR_MISSING');
  });

  it('never claims the canonical semantic_768 owner or changes defaults in the task runtime', async () => {
    const { fetchImpl } = stubFetch(unit768());
    const executor = createEmbeddingGemma2ChallengerExecutorV1({ endpoint: ENDPOINT, fetchImpl });
    const result = await embedEmbeddingGemmaTaskV1({
      executor,
      mode: 'retrieval_document',
      text: 'graphBFS traverses CSR arrays',
      representationRevision: 'challenger-test',
      dimensions: [768],
    });
    expect(result.executor).toBe(EMBEDDINGGEMMA2_CHALLENGER_EXECUTOR_ID);
    expect(result.persistencePerformed).toBe(false);
    expect(result.canonicalDefaultChanged).toBe(false);
    expect(JSON.stringify(result.lineage)).not.toContain('"representationId":"semantic_768"');
  });
});

// Live check: runs only when the local Ollama already has the challenger model.
const liveAvailable = await fetch('http://127.0.0.1:11434/api/tags')
  .then((r) => r.ok ? r.json() : null)
  .then((tags: { models?: { name: string }[] } | null) =>
    Boolean(tags?.models?.some((m) => m.name === EMBEDDINGGEMMA2_CHALLENGER_MODEL)))
  .catch(() => false);

describe.skipIf(!liveAvailable)('EmbeddingGemma 2 challenger executor (live Ollama)', () => {
  const cosine = (a: Float32Array, b: Float32Array) => {
    let dot = 0;
    for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
    return dot;
  };

  it('returns 768 finite normalized values for code text', async () => {
    const executor = createEmbeddingGemma2ChallengerExecutorV1();
    const result = await executor.embedNative768('function graphBFS(rowPtr, colIndices, startNode)');
    expect(result.vector.length).toBe(768);
    expect(Number.isFinite(result.vector[0])).toBe(true);
    expect(cosine(result.vector, result.vector)).toBeCloseTo(1, 4);
  });

  it('ranks a related code snippet above an unrelated sentence', async () => {
    const executor = createEmbeddingGemma2ChallengerExecutorV1();
    const query = (await executor.embedNative768('breadth-first search over a CSR adjacency graph')).vector;
    const related = (await executor.embedNative768('function graphBFS(rowPtr, colIndices, startNode) { /* BFS over CSR */ }')).vector;
    const unrelated = (await executor.embedNative768('Recipe: whisk two eggs with sugar and butter.')).vector;
    expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated));
  });
});
