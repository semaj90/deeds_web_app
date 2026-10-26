import { describe, expect, it } from 'vitest';
import { FeatureVectorGenerator } from './feature-vector-generator.js';

describe('FeatureVectorGenerator dimensions', () => {
  it('reports the handcrafted feature width instead of padding it to a configured embedding width', async () => {
    const generator = new FeatureVectorGenerator({
      maxVocabulary: 5000,
      embedding: { model: 'handcrafted-feature-v1' },
    });

    const result = await generator.generateFeatureVector(
      'packet-1',
      'src/retrieval/search.ts',
      'export function search(query: string) { return query; }',
    );

    expect(result.dimension).toBe(result.features.length);
    expect(result.dimension).toBe(40);
    expect(result.embedding).toBeUndefined();
    expect(result.embeddingDimension).toBeUndefined();
    expect(result.modelVersion).toBe('handcrafted-feature-v1');
  });
});
