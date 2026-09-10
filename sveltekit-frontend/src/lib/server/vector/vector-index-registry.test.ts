import { describe, expect, it } from 'vitest';

import {
  EMBEDDINGGEMMA_FULL768_CONTRACT,
  EMBEDDINGGEMMA_FULL768_V1,
  EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT,
  ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1,
  EMBEDDINGGEMMA_MRL512_CONTRACT,
  EMBEDDINGGEMMA_MRL256_CONTRACT,
  EMBEDDINGGEMMA_MRL128_CONTRACT,
  projectEmbeddingForContract,
  projectLegacyDirectSlice384ForMigration,
} from './embeddinggemma-contracts.js';
import {
  VECTOR_INDEX_REGISTRY,
  getVectorIndexRegistryEntry,
  listVectorIndexRegistryEntries,
} from './vector-index-registry.js';
import {
  VECTOR_LANES,
  getVectorLane,
  getVectorLaneByCollection,
  getActiveSemanticVectorLane,
} from './lane-registry.js';

describe('vector-index-registry', () => {
  it('defines native semantic_768 as canonical and 384 as legacy migration only', () => {
    expect(EMBEDDINGGEMMA_FULL768_V1).toBe('embeddinggemma-full768-v1');
    expect(EMBEDDINGGEMMA_FULL768_CONTRACT.dimension).toBe(768);
    expect(EMBEDDINGGEMMA_FULL768_CONTRACT.sourceDimension).toBe(768);
    expect(EMBEDDINGGEMMA_FULL768_CONTRACT.outputDimension).toBe(768);
    expect(EMBEDDINGGEMMA_FULL768_CONTRACT.truncation).toBe('none');
    expect(EMBEDDINGGEMMA_FULL768_CONTRACT.canonical).toBe(true);
    expect(EMBEDDINGGEMMA_FULL768_CONTRACT.lifecycle).toBe('ACTIVE');

    expect(ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1).toBe(
      'atlas-embeddinggemma-direct-slice384-v1',
    );
    expect(EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT.dimension).toBe(384);
    expect(EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT.sourceDimension).toBe(768);
    expect(EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT.truncation).toBe('legacy_direct_slice');
    expect(EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT.queryCompatible).toBe(false);
    expect(EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT.canonical).toBe(false);
    expect(EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT.lifecycle).toBe('LEGACY_MIGRATION_ONLY');
  });

  it('allows only official EmbeddingGemma MRL widths in the normal projector', () => {
    for (const [contract, dimension] of [
      [EMBEDDINGGEMMA_MRL512_CONTRACT, 512],
      [EMBEDDINGGEMMA_MRL256_CONTRACT, 256],
      [EMBEDDINGGEMMA_MRL128_CONTRACT, 128],
    ] as const) {
      expect(contract.outputDimension).toBe(dimension);
      expect(contract.truncation).toBe('mrl_prefix');
      expect(contract.projectionKind).toBe('mrl_prefix');
      expect(contract.representationFamily).toBe('semantic_mrl');
      expect(contract.queryCompatible).toBe(true);
      expect(contract.renormalizeAfterProjection).toBe(true);
    }

    const source = [3, 4, ...new Array(766).fill(0)];
    const projected = projectEmbeddingForContract(source, EMBEDDINGGEMMA_MRL128_CONTRACT);
    const norm = Math.sqrt(projected.reduce((sum, value) => sum + value * value, 0));
    expect(projected).toHaveLength(128);
    expect(norm).toBeCloseTo(1, 6);
    expect(projected[0]).toBeCloseTo(0.6, 6);
    expect(projected[1]).toBeCloseTo(0.8, 6);
  });

  it('rejects 384 from the normal runtime projector but preserves explicit migration replay', () => {
    const source = new Array(768).fill(0).map((_, index) => index / 768);
    expect(() =>
      projectEmbeddingForContract(source, EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT),
    ).toThrow('LEGACY_384_PROJECTION_REQUIRES_EXPLICIT_MIGRATION_HELPER');

    const legacy = projectLegacyDirectSlice384ForMigration(source);
    expect(legacy).toHaveLength(384);
    expect(legacy[383]).toBe(source[383]);
  });

  it('registers canonical v2 and explicit legacy replay indexes separately', () => {
    expect(VECTOR_INDEX_REGISTRY.vectorSnapshot5k.snapshotLimit).toBe(5000);
    expect(VECTOR_INDEX_REGISTRY.qdrantSource768V2.collection).toBe('codebase_chunks_768_v2');
    expect(VECTOR_INDEX_REGISTRY.qdrantSource768.collection).toBe('codebase_chunks_768');
    expect(VECTOR_INDEX_REGISTRY.qdrantSource768.vectorContract?.dimension).toBe(768);
    expect(VECTOR_INDEX_REGISTRY.qdrantHybrid.collection).toBe('codebase_chunks_384_hybrid');
    expect(VECTOR_INDEX_REGISTRY.qdrantDense.collection).toBe('codebase_chunks_384');
  });

  it('returns registry entries by key', () => {
    expect(getVectorIndexRegistryEntry('vectorSnapshot5k').id).toBe('vector-snapshot-5k');
    expect(listVectorIndexRegistryEntries()).toHaveLength(Object.keys(VECTOR_INDEX_REGISTRY).length);
  });

  it('exposes only semantic_768 as the active runtime semantic lane', () => {
    expect(getVectorLane('topology128').dimension).toBe(128);
    expect(getVectorLane('source768').role).toBe('canonical');
    expect(getVectorLane('source768').dimension).toBe(768);
    expect(getVectorLane('source768').collection).toBe('codebase_chunks_768_v2');

    expect(getActiveSemanticVectorLane().laneId).toBe('embeddinggemma-semantic-768');
    expect(getVectorLaneByCollection('codebase_chunks_768_v2')?.laneId).toBe('embeddinggemma-semantic-768');
    expect(getVectorLaneByCollection('codebase_chunks_768')).toBeUndefined();
    expect(getVectorLaneByCollection('codebase_chunks_384_hybrid')).toBeUndefined();
    expect(Object.keys(VECTOR_LANES)).toHaveLength(3);
  });
});
