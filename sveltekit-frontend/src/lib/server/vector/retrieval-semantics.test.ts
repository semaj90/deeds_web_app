// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  QDRANT_COLLECTION_BY_TIER,
  QDRANT_DENSE_FALLBACK_COLLECTION,
  QDRANT_HYBRID_COLLECTION,
  QDRANT_SOURCE_COLLECTION
} from './retrieval-semantics.js';

describe('retrieval semantics', () => {
  it('keeps the dense fallback on the canonical 768 collection', () => {
    expect(QDRANT_DENSE_FALLBACK_COLLECTION).toBe(QDRANT_HYBRID_COLLECTION);
    expect(QDRANT_DENSE_FALLBACK_COLLECTION).toBe('codebase_chunks_768_v2');
  });

  it('keeps tier resolution on the canonical 768 collections', () => {
    expect(QDRANT_COLLECTION_BY_TIER.hot).toBe(QDRANT_HYBRID_COLLECTION);
    expect(QDRANT_COLLECTION_BY_TIER.warm).toBe(QDRANT_HYBRID_COLLECTION);
    expect(QDRANT_COLLECTION_BY_TIER.cold).toBe(QDRANT_SOURCE_COLLECTION);
  });
});
