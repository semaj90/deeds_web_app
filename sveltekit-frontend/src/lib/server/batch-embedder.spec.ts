import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  generateEmbeddings: vi.fn(async (texts: string[]) => ({
    vectors: texts.map((text) => new Array(768).fill(text.length)),
  })),
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  generateEmbeddings: state.generateEmbeddings,
}));

import { embedText, embedTexts } from './batch-embedder.js';

describe('batch embedder cache identity boundary', () => {
  beforeEach(() => {
    state.generateEmbeddings.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delegates batch requests to the shared provider client', async () => {
    const result = await embedTexts(['alpha', 'beta']);

    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(Float32Array);
    expect(result[0]).toHaveLength(768);
    expect(state.generateEmbeddings).toHaveBeenCalledWith(['alpha', 'beta']);
  });

  it('preserves the batching window without using a text-only cache', async () => {
    vi.useFakeTimers();
    const resultPromise = embedText('alpha');
    await vi.advanceTimersByTimeAsync(50);

    const result = await resultPromise;
    expect(result).toBeInstanceOf(Float32Array);
    expect(result).toHaveLength(768);
    expect(state.generateEmbeddings).toHaveBeenCalledWith(['alpha']);
  });
});
