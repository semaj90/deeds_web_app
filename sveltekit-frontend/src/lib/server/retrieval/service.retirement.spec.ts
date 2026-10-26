// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { isRetired384SearchResult } from './service.js';

describe('unified retrieval retired 384-D result boundary', () => {
  const baseResult = {
    id: 'candidate-1',
    rank: 0,
    score: 0.9,
    confidence: 0.9,
    source: 'qdrant-768' as const,
    packet_key: null,
    source_ref: null,
    feature_id: null,
    file_path: null,
    summary: null,
    metadata: {},
  };

  it('rejects results explicitly marked as the retired 384 lane', () => {
    expect(isRetired384SearchResult({ ...baseResult, source: 'qdrant-384' })).toBe(true);
  });

  it('rejects results carrying the retired 384 representation marker', () => {
    expect(isRetired384SearchResult({
      ...baseResult,
      metadata: { embedding_lane: 'dense_384' },
    })).toBe(true);
  });

  it('rejects unqualified legacy 384-dimension results and preserves 768 results', () => {
    expect(isRetired384SearchResult({
      ...baseResult,
      metadata: { embedding_dim: 384 },
    })).toBe(true);
    expect(isRetired384SearchResult({
      ...baseResult,
      metadata: { embedding_lane: 'dense_768', embedding_dim: 768 },
    })).toBe(false);
  });
});
