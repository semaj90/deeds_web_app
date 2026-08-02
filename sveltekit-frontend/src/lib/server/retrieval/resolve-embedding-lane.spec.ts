// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { DenseRepresentationName } from '../atlas/contracts/dense-lane-policy.js';
import { EmbeddingLaneTelemetryReason, gateEmbeddingLaneResolution, resolveEmbeddingLane } from './resolve-embedding-lane.js';

describe('resolveEmbeddingLane', () => {
  it('resolves 768 by dimension when no explicit lineage is present', () => {
    const result = resolveEmbeddingLane({ embedding_dim: 768 });

    expect(result.lane).toBe(DenseRepresentationName.SEMANTIC_768);
    expect(result.reason).toBe(EmbeddingLaneTelemetryReason.NATIVE_DIMENSION_FALLBACK);
  });

  it('blocks legacy 384 from runtime resolution', () => {
    const byDim = resolveEmbeddingLane({ embedding_dim: 384 });
    const byVector = resolveEmbeddingLane({ vector_name: 'dense_384' });
    const byCollection = resolveEmbeddingLane({ collection: 'codebase_chunks_384_hybrid' });

    expect(byDim.lane).toBeNull();
    expect(byVector.lane).toBeNull();
    expect(byCollection.lane).toBeNull();
    expect(byDim.reason).toBe(EmbeddingLaneTelemetryReason.LEGACY_DIMENSION_EXPLICIT_ONLY);
    expect(byVector.reason).toBe(EmbeddingLaneTelemetryReason.LEGACY_DIMENSION_EXPLICIT_ONLY);
    expect(byCollection.reason).toBe(EmbeddingLaneTelemetryReason.LEGACY_DIMENSION_EXPLICIT_ONLY);
  });

  it('gates legacy 384 dimension-only hits', () => {
    const result = gateEmbeddingLaneResolution({ embedding_dim: 384 }, 'packet:legacy-384');

    expect(result.gatePass).toBe(false);
    expect(result.reason).toContain('legacy_dimension_explicit_only');
  });
});
