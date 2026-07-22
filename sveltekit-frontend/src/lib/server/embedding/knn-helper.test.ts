import { describe, expect, it } from 'vitest';

import {
  cosineSimilarity,
  topKDomainCentroids,
  validateVectorContract,
  type VectorContract,
} from './knn-helper.js';

const contract: VectorContract = {
  modelId: 'embeddinggemma-content-384-v1',
  modelVersion: '2026-07-21',
  dimension: 3,
  normalization: 'l2',
  metric: 'cosine',
  vectorPurpose: 'domain-centroid',
};

describe('knn-helper', () => {
  it('computes cosine similarity for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it('rejects mismatched vector contracts', () => {
    expect(() =>
      validateVectorContract(
        contract,
        { ...contract, dimension: 384 },
      ),
    ).toThrow(/dimension mismatch/i);
  });

  it('returns ranked centroid matches only for compatible vectors', () => {
    const matches = topKDomainCentroids(
      [1, 0, 0],
      [
        {
          domainId: 'retrieval',
          centroidId: 'centroid-retrieval',
          centroidVersion: 'v1',
          centroidEmbeddingHash: 'hash-r',
          vectorContract: contract,
          embedding: [0.9, 0.1, 0],
        },
        {
          domainId: 'database',
          centroidId: 'centroid-database',
          centroidVersion: 'v1',
          centroidEmbeddingHash: 'hash-d',
          vectorContract: contract,
          embedding: [0, 1, 0],
        },
      ],
      2,
      contract,
    );

    expect(matches).toHaveLength(2);
    expect(matches[0].domainId).toBe('retrieval');
    expect(matches[0].rank).toBe(1);
    expect(matches[0].similarity).toBeGreaterThan(matches[1].similarity);
  });

  it('rejects centroid vectors with incompatible dimensions', () => {
    expect(() =>
      topKDomainCentroids(
        [1, 0, 0],
        [
          {
            domainId: 'retrieval',
            centroidId: 'centroid-retrieval',
            centroidVersion: 'v1',
            centroidEmbeddingHash: 'hash-r',
            vectorContract: contract,
            embedding: [1, 0],
          },
        ],
        1,
        contract,
      ),
    ).toThrow(/dimension mismatch/i);
  });
});
