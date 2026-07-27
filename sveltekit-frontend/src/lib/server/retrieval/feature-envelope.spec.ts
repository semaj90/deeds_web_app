import { describe, expect, it } from 'vitest';

import { DenseSignalSchema } from './feature-envelope.js';

describe('feature-envelope dense lineage', () => {
  it('accepts dense_384 lineage metadata for the canonical retrieval lane', () => {
    const parsed = DenseSignalSchema.parse({
      name: 'dense',
      score: 0.91,
      qdrant_point_id: 'point-1',
      embedding_lane: 'dense_384',
      embedding_status: 'ACTIVE',
      embedding_native_dimension: 768,
      projection_source_dimension: 768,
      projection_method: 'direct_slice',
      projection_version: 'atlas-embeddinggemma-direct-slice384-v1',
      metric: 'cosine',
      confidence: 0.93,
    });

    expect(parsed.embedding_lane).toBe('dense_384');
    expect(parsed.projection_source_dimension).toBe(768);
  });

  it('accepts dense_768 lineage metadata for the native semantic lane', () => {
    const parsed = DenseSignalSchema.parse({
      name: 'dense',
      score: 0.83,
      qdrant_point_id: 'point-2',
      embedding_lane: 'dense_768',
      embedding_status: 'REFERENCE_ONLY',
      embedding_native_dimension: 768,
      projection_method: 'none',
      projection_version: 'embeddinggemma-full768-v1',
      metric: 'cosine',
      confidence: 0.88,
    });

    expect(parsed.embedding_lane).toBe('dense_768');
    expect(parsed.embedding_status).toBe('REFERENCE_ONLY');
  });
});
