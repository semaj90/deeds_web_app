import { describe, expect, it } from 'vitest';

import {
  LATENT_PROGRESSION,
  buildKMeansProgressionPlan,
  compressEmbedding,
  decompressEmbedding,
} from './kmeans-latent-progression.js';

describe('kmeans latent progression contract', () => {
  it('keeps the progression on the 512 candidate lane, not 384', () => {
    const names = LATENT_PROGRESSION.map((level) => level.name);

    expect(names).toEqual(['embedding_768', 'embedding_512', 'embedding_128', 'embedding_64']);
    expect(names).not.toContain('embedding_384');

    const candidate = LATENT_PROGRESSION.find((level) => level.name === 'embedding_512');
    expect(candidate).toMatchObject({
      dimension: 512,
      storageFormat: 'vector',
    });
  });

  it('builds a 512-based progression plan with explicit downstream reductions', () => {
    const embedding = new Float32Array(768).fill(0.25);
    const plan = buildKMeansProgressionPlan('feature-123', embedding, {
      k512: 88,
      k128: 32,
      k64: 16,
    });

    expect(plan.input_embedding).toHaveLength(768);
    expect(plan.levels.level_512.k).toBe(88);
    expect(plan.levels.level_128.k).toBe(32);
    expect(plan.levels.level_64.k).toBe(16);
  });

  it('round-trips compressed embeddings for the derived bytea lanes', () => {
    const source = new Float32Array([1, 2, 3, 4]);
    const compressed = compressEmbedding(source);
    const roundTrip = decompressEmbedding(compressed);

    expect(compressed.dimension).toBe(4);
    expect(roundTrip).toHaveLength(4);
    expect(Array.from(roundTrip)).toEqual([1, 2, 3, 4]);
  });
});
