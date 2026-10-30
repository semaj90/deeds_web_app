import { beforeEach, describe, expect, it, vi } from 'vitest';

const { batchCosineSimilarity } = vi.hoisted(() => ({
  batchCosineSimilarity: vi.fn(),
}));

vi.mock('$lib/server/gpu/libtorch-bridge.js', () => ({ batchCosineSimilarity }));
vi.mock('./mla-kv-compress.js', () => ({ mlaFusionRerank: vi.fn() }));

import { isComparableEmbedding, rerankCandidates } from './gpu-rerank.js';

describe('GPU rerank candidate admission', () => {
  beforeEach(() => batchCosineSimilarity.mockReset());

  it('admits only finite, nonzero vectors with matching dimensions', () => {
    expect(isComparableEmbedding([1, 2], [2, 3])).toBe(true);
    expect(isComparableEmbedding([1, 2], undefined)).toBe(false);
    expect(isComparableEmbedding([1, 2], [1])).toBe(false);
    expect(isComparableEmbedding([1, 2], [0, 0])).toBe(false);
    expect(isComparableEmbedding([0, 0], [1, 2])).toBe(false);
    expect(isComparableEmbedding([1, Number.NaN], [1, 2])).toBe(false);
    expect(isComparableEmbedding([1, 2], [1, Number.POSITIVE_INFINITY])).toBe(false);
  });

  it('preserves retrieval score when candidate vectors are absent', async () => {
    const result = await rerankCandidates([1, 0], [
      { stable_key: 'candidate-a', pre_score: 0.42 },
    ]);

    expect(result).toEqual([
      expect.objectContaining({ stable_key: 'candidate-a', gpu_score: 0, final_score: 0.42 }),
    ]);
    expect(batchCosineSimilarity).not.toHaveBeenCalled();
  });
});
