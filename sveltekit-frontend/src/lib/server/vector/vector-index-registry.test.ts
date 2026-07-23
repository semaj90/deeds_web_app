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
import {
  VECTOR_LANES,
  getVectorLane,
  getVectorLaneByCollection,
} from './lane-registry.js';

describe('vector-index-registry', () => {
  it('defines the canonical 768 contract and derived 384 projection', () => {
    expect(EMBEDDINGGEMMA_FULL768_V1).toBe('embeddinggemma-full768-v1');
    expect(EMBEDDINGGEMMA_FULL768_CONTRACT.dimension).toBe(768);
    expect(EMBEDDINGGEMMA_FULL768_CONTRACT.sourceDimension).toBe(768);
    expect(EMBEDDINGGEMMA_FULL768_CONTRACT.outputDimension).toBe(768);
    expect(EMBEDDINGGEMMA_FULL768_CONTRACT.truncation).toBe('none');
    expect(EMBEDDINGGEMMA_FULL768_CONTRACT.canonical).toBe(true);

    expect(EMBEDDINGGEMMA_PREFIX384_V1).toBe('atlas-embeddinggemma-direct-slice384-v1');
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.dimension).toBe(384);
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.sourceDimension).toBe(768);
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.outputDimension).toBe(384);
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.truncation).toBe('prefix');
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.canonical).toBe(false);
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.vectorPurpose).toBe('content-semantic');
  });

  it('registers the frozen 5k snapshot and retrieval lanes', () => {
    expect(VECTOR_INDEX_REGISTRY.vectorSnapshot5k.snapshotLimit).toBe(5000);
    expect(VECTOR_INDEX_REGISTRY.qdrantSource768.collection).toBe('codebase_chunks_768');
    expect(VECTOR_INDEX_REGISTRY.qdrantSource768.vectorContract?.dimension).toBe(768);
    expect(VECTOR_INDEX_REGISTRY.qdrantHybrid.collection).toBe('codebase_chunks_384_hybrid');
    expect(VECTOR_INDEX_REGISTRY.qdrantDense.collection).toBe('codebase_chunks_384');
    expect(VECTOR_INDEX_REGISTRY.turbovecShadow.backend).toBe('turbovec-shadow');
  });

  it('returns registry entries by key', () => {
    expect(getVectorIndexRegistryEntry('vectorSnapshot5k').id).toBe('vector-snapshot-5k');
    expect(listVectorIndexRegistryEntries()).toHaveLength(Object.keys(VECTOR_INDEX_REGISTRY).length);
  });

  it('exposes both EmbeddingGemma lanes in the lane registry', () => {
    expect(getVectorLane('retrieval384').role).toBe('canonical');
    expect(getVectorLane('retrieval384').dimension).toBe(384);
    expect(getVectorLane('retrieval384').collection).toBe('codebase_chunks_384_hybrid');

    expect(getVectorLane('source768').role).toBe('source');
    expect(getVectorLane('source768').dimension).toBe(768);
    expect(getVectorLane('source768').collection).toBe('codebase_chunks_768');

    expect(getVectorLaneByCollection('codebase_chunks_768')?.laneId).toBe('embeddinggemma-768d');
    expect(getVectorLaneByCollection('codebase_chunks_384_hybrid')?.laneId).toBe('embeddinggemma-prefix384');
    expect(Object.keys(VECTOR_LANES)).toHaveLength(3);
  });
});
