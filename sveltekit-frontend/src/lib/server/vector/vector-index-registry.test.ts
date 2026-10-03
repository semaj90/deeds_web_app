import { describe, expect, it } from 'vitest';

import {
  EMBEDDINGGEMMA_FULL768_CONTRACT,
  EMBEDDINGGEMMA_FULL768_V1,
  EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT,
  ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1,
  EMBEDDINGGEMMA_MRL512_CONTRACT,
  EMBEDDINGGEMMA_MRL256_CONTRACT,
  EMBEDDINGGEMMA_MRL128_CONTRACT,
  EMBEDDINGGEMMA_LATENT256_CONTRACT,
  EMBEDDINGGEMMA_LATENT128_CONTRACT,
  EMBEDDINGGEMMA_LATENT64_CONTRACT,
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

  it('describes latent 256/128/64 as derived non-canonical lanes and never projects them locally', () => {
    for (const [contract, dimension] of [
      [EMBEDDINGGEMMA_LATENT256_CONTRACT, 256],
      [EMBEDDINGGEMMA_LATENT128_CONTRACT, 128],
      [EMBEDDINGGEMMA_LATENT64_CONTRACT, 64],
    ] as const) {
      expect(contract.outputDimension).toBe(dimension);
      expect(contract.representationFamily).toBe('latent_autoencoder');
      expect(contract.projectionKind).toBe('learned_autoencoder');
      expect(contract.canonical).toBe(false);
      expect(contract.queryCompatible).toBe(false);
      expect(contract.lifecycle).toBe('REFERENCE_ONLY');
      expect(() => projectEmbeddingForContract(new Array(768).fill(0.1), contract)).toThrow(
        /LATENT_LANE_REQUIRES_NESTED_AUTOENCODER_SERVICE/,
      );
    }
    // latent_128 is a slice of latent_256, not of the 768 vector
    expect(EMBEDDINGGEMMA_LATENT128_CONTRACT.sourceDimension).toBe(256);
    expect(EMBEDDINGGEMMA_LATENT128_CONTRACT.truncation).toBe('latent_slice_first_n');
    expect(EMBEDDINGGEMMA_LATENT256_CONTRACT.sourceDimension).toBe(768);
    expect(EMBEDDINGGEMMA_LATENT64_CONTRACT.sourceDimension).toBe(768);
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

  it('registers the declared 768 projection and explicit challenger separately', () => {
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
    expect(getVectorLane('source768').collection).toBe('codebase_chunks_768');

    expect(getActiveSemanticVectorLane().laneId).toBe('embeddinggemma-semantic-768');
    expect(getVectorLaneByCollection('codebase_chunks_768')?.laneId).toBe('embeddinggemma-semantic-768');
    expect(getVectorLaneByCollection('codebase_chunks_768_v2')).toBeUndefined();
    expect(getVectorLaneByCollection('codebase_chunks_384_hybrid')).toBeUndefined();
    expect(Object.keys(VECTOR_LANES)).toHaveLength(3);
  });
});
