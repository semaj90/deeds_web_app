// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { selectLaneNamesForTier } from './service.js';

describe('retrieval service lane defaults', () => {
  it('keeps 384 out of the automatic tier defaults', () => {
    expect(selectLaneNamesForTier('hot')).toEqual(['lexical', 'qdrant-768', 'gpu-cuvs', 'bm25']);
    expect(selectLaneNamesForTier('warm')).toEqual(['lexical', 'qdrant-768', 'bm25', 'gpu-cuvs']);
    expect(selectLaneNamesForTier('cold')).toEqual(['lexical', 'qdrant-768', 'bm25', 'gpu-cuvs']);
  });
});
