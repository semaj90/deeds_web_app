import { describe, expect, it } from 'vitest';

import {
  EMBEDDINGGEMMA_FULL768_CONTRACT,
  EMBEDDINGGEMMA_FULL768_V1,
  EMBEDDINGGEMMA_PREFIX384_CONTRACT,
  EMBEDDINGGEMMA_PREFIX384_V1,
  EMBEDDINGGEMMA_MRL512_CONTRACT,
  EMBEDDINGGEMMA_MRL256_CONTRACT,
  EMBEDDINGGEMMA_MRL128_CONTRACT,
  projectEmbeddingForContract,
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
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.truncation).toBe('legacy_direct_slice');
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.projectionKind).toBe('direct_slice');
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.encoderFamily).toBe('embeddinggemma');
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.queryCompatible).toBe(false);
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.queryEncoderRole).toBe('QUERY');
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.candidateEncoderRole).toBe('DOCUMENT');
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.canonical).toBe(false);
    expect(EMBEDDINGGEMMA_PREFIX384_CONTRACT.vectorPurpose).toBe('content-semantic');
  });

  it('registers the frozen 5k snapshot and retrieval lanes', () => {
    expect(VECTOR_INDEX_REGISTRY.vectorSnapshot5k.snapshotLimit).toBe(5000);
    expect(VECTOR_INDEX_REGISTRY.qdrantSource768V2.collection).toBe('codebase_chunks_768_v2');
    expect(VECTOR_INDEX_REGISTRY.qdrantSource768.collection).toBe('codebase_chunks_768');
    expect(VECTOR_INDEX_REGISTRY.qdrantSource768.vectorContract?.dimension).toBe(768);
    expect(VECTOR_INDEX_REGISTRY.qdrantHybrid.collection).toBe('codebase_chunks_384_hybrid');
    expect(VECTOR_INDEX_REGISTRY.qdrantDense.collection).toBe('codebase_chunks_384');
    expect(VECTOR_INDEX_REGISTRY.turbovecShadow.backend).toBe('turbovec-shadow');
  });

  it('defines model-native MRL prefixes and renormalizes after projection', () => {
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
      expect(contract.queryEncoderRole).toBe('QUERY');
      expect(contract.candidateEncoderRole).toBe('DOCUMENT');
      expect(contract.renormalizeAfterProjection).toBe(true);
      expect(contract.modelRevision).toBe(EMBEDDINGGEMMA_FULL768_V1);
    }

    const projected = projectEmbeddingForContract([3, 4, ...new Array(763).fill(0)], EMBEDDINGGEMMA_MRL128_CONTRACT);
    const norm = Math.sqrt(projected.reduce((sum, value) => sum + value * value, 0));
    expect(projected).toHaveLength(128);
    expect(norm).toBeCloseTo(1, 6);
    expect(projected[0]).toBeCloseTo(0.6, 6);
    expect(projected[1]).toBeCloseTo(0.8, 6);
  });

  it('returns registry entries by key', () => {
    expect(getVectorIndexRegistryEntry('vectorSnapshot5k').id).toBe('vector-snapshot-5k');
    expect(listVectorIndexRegistryEntries()).toHaveLength(Object.keys(VECTOR_INDEX_REGISTRY).length);
  });

  it('exposes the active lane registry without legacy 384 entries', () => {
    expect(getVectorLane('topology128').kind).toBe('topology');
    expect(getVectorLane('topology128').dimension).toBe(128);
    expect(getVectorLane('topology128').collection).toBe('codebase_topology_128');

    expect(getVectorLane('source768').role).toBe('source');
    expect(getVectorLane('source768').dimension).toBe(768);
    expect(getVectorLane('source768').collection).toBe('codebase_chunks_768');

    expect(getVectorLaneByCollection('codebase_chunks_768_v2')?.laneId).toBeUndefined();
    expect(getVectorLaneByCollection('codebase_chunks_768')?.laneId).toBe('embeddinggemma-768d');
    expect(getVectorLaneByCollection('codebase_topology_128')?.laneId).toBe('atlas-topology128');
    expect(getVectorLaneByCollection('codebase_chunks_384_hybrid')).toBeUndefined();
    expect(Object.keys(VECTOR_LANES)).toHaveLength(3);
  });
});
