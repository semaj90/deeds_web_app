// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { QdrantLane } from './search-lanes.js';

describe('QdrantLane 384-D retirement', () => {
  it('allows the canonical 768-D default lane', () => {
    expect(() => new QdrantLane()).not.toThrow();
  });

  it('rejects 384-D configuration before any Qdrant request', () => {
    expect(
      () => new QdrantLane('http://127.0.0.1:6333', 'codebase_chunks_384', 384, 'dense_384')
    ).toThrow('LEGACY_384_QDRANT_LANE_DISABLED');
  });

  it('rejects a retired collection even when configured as 768-D', () => {
    expect(
      () => new QdrantLane('http://127.0.0.1:6333', 'codebase_chunks_384_hybrid', 768, 'dense_768')
    ).toThrow('LEGACY_384_QDRANT_LANE_DISABLED');
  });
});
