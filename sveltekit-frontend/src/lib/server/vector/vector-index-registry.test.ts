import { describe, expect, it } from 'vitest';

import {
  EMBEDDINGGEMMA_FULL768_CONTRACT,
  EMBEDDINGGEMMA_FULL768_V1,
  EMBEDDINGGEMMA_PREFIX384_CONTRACT,
  EMBEDDINGGEMMA_PREFIX384_V1,
} from './embeddinggemma-prefix384.js';
import {
  VECTOR_INDEX_REGISTRY,
  getVectorIndexRegistryEntry,
  listVectorIndexRegistryEntries,
} from './vector-index-registry.js';

describe('vector-index-registry', () => {
  it('defines the canonical 768 contract and derived 384 projection', () => {
    expect(EMBEDDINGGEMMA_FULL768_V1).toBe('embeddinggemma-full768-v1');
    expect(EMBEDDINGGEMMA_FULL768_CONTRACT.dimension).toBe(768);
    expect(EMBEDDINGGEMMA_FULL768_CONTRACT.sourceDimension).toBe(768);
    expect(EMBEDDINGGEMMA_FULL768_CONTRACT.outputDimension).toBe(768);
    expect(EMBEDDINGGEMMA_FULL768_CONTRACT.truncation).toBe('none');
    expect(EMBEDDINGGEMMA_FULL768_CONTRACT.canonical).toBe(true);

    expect(EMBEDDINGGEMMA_PREFIX384_V1).toBe('embeddinggemma-prefix384-v1');
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.dimension).toBe(384);
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.sourceDimension).toBe(768);
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.outputDimension).toBe(384);
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.truncation).toBe('prefix');
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.canonical).toBe(false);
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.vectorPurpose).toBe('content-semantic');
  });

  it('registers the frozen 5k snapshot and retrieval lanes', () => {
    expect(VECTOR_INDEX_REGISTRY.vectorSnapshot5k.snapshotLimit).toBe(5000);
    expect(VECTOR_INDEX_REGISTRY.qdrantHybrid.collection).toBe('codebase_chunks_384_hybrid');
    expect(VECTOR_INDEX_REGISTRY.qdrantDense.collection).toBe('codebase_chunks_384');
    expect(VECTOR_INDEX_REGISTRY.turbovecShadow.backend).toBe('turbovec-shadow');
  });

  it('returns registry entries by key', () => {
    expect(getVectorIndexRegistryEntry('vectorSnapshot5k').id).toBe('vector-snapshot-5k');
    expect(listVectorIndexRegistryEntries()).toHaveLength(Object.keys(VECTOR_INDEX_REGISTRY).length);
  });
});
