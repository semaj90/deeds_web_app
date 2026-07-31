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

  it('does not infer legacy 384 from dimension alone', () => {
    const result = resolveEmbeddingLane({ embedding_dim: 384 });

    expect(result.lane).toBeNull();
    expect(result.reason).toBe(EmbeddingLaneTelemetryReason.LEGACY_DIMENSION_EXPLICIT_ONLY);
  });

  it('still resolves 384 when lineage is explicit via vector name', () => {
    const result = resolveEmbeddingLane({ vector_name: 'dense_384' });

    expect(result.lane).toBe(DenseRepresentationName.SEMANTIC_384);
    expect(result.reason).toBe(EmbeddingLaneTelemetryReason.VECTOR_NAME);
  });

  it('gates legacy 384 dimension-only hits', () => {
    const result = gateEmbeddingLaneResolution({ embedding_dim: 384 }, 'packet:legacy-384');

    expect(result.gatePass).toBe(false);
    expect(result.reason).toContain('legacy_dimension_explicit_only');
  });
});
