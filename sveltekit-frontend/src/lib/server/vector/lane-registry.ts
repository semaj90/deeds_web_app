import { SEMANTIC_DIMENSION } from '../embedding/embedding-contract-768.js';

/**
 * Runtime vector-lane registry.
 *
 * semantic_768 is the single active semantic lane. Lower-dimensional vectors
 * are separate topology/routing representations, never alternate semantic
 * authorities. Legacy 384 replay lanes are intentionally absent here.
 */
export type SemanticDimension = typeof SEMANTIC_DIMENSION;
export type TopologyDimension = 128 | 64;

export type LaneRegistryKind =
  | 'semantic'
  | 'retrieval'
  | 'topology'
  | 'authority'
  | 'routing'
  | 'memory'
  | 'legacy-vector';

export type VectorLaneRole =
  | 'source'
  | 'canonical'
  | 'derived'
  | 'legacy'
  | 'experimental';

export interface VectorLaneContract {
  laneId: string;
  kind: LaneRegistryKind;
  role: VectorLaneRole;
  modelId: string;
  vectorName: string;
  collection: string;
  dimension: SemanticDimension | 64 | 128;
  projection: 'none' | 'direct_slice' | 'autoencoder' | 'latent';
  normalization: 'none' | 'l2';
  status: 'active' | 'partial' | 'legacy' | 'blocked';
  notes: string;
}

export const VECTOR_LANES = {
  source768: {
    laneId: 'embeddinggemma-semantic-768',
    kind: 'semantic',
    role: 'canonical',
    modelId: 'embeddinggemma:latest',
    vectorName: 'content',
    collection: 'codebase_chunks_768_v2',
    dimension: SEMANTIC_DIMENSION,
    projection: 'none',
    normalization: 'l2',
    status: 'active',
    notes: 'Canonical native EmbeddingGemma semantic_768 lane. Qdrant is a rebuildable projection; PostgreSQL retains canonical identity/lineage authority.',
  },
  topology128: {
    laneId: 'atlas-topology128',
    kind: 'topology',
    role: 'derived',
    modelId: 'atlas-topology-features-v1',
    vectorName: 'latent_128',
    collection: 'codebase_topology_128',
    dimension: 128,
    projection: 'autoencoder',
    normalization: 'l2',
    status: 'partial',
    notes: 'Topology/structural lane for graph and neighborhood features. Separate from semantic retrieval and latent 64 routing.',
  },
  latent64: {
    laneId: 'atlas-latent64',
    kind: 'routing',
    role: 'derived',
    modelId: 'atlas-autoencoder-768x64-v1',
    vectorName: 'topology_ae64_v1',
    collection: 'codebase_topology_64',
    dimension: 64,
    projection: 'latent',
    normalization: 'l2',
    status: 'partial',
    notes: 'Legacy trained topology representation for KMeans / SOM / TurboVec acceleration only; not interchangeable with nested latent_64 or semantic_768.',
  },
} as const satisfies Record<string, VectorLaneContract>;

export type VectorLaneId = keyof typeof VECTOR_LANES;

export function getVectorLane(laneId: VectorLaneId): VectorLaneContract {
  return VECTOR_LANES[laneId];
}

export function getVectorLaneByCollection(collection: string): VectorLaneContract | undefined {
  return Object.values(VECTOR_LANES).find((lane) => lane.collection === collection);
}

/**
 * The single active semantic lane. Fails loudly if the runtime registry drifts
 * away from native semantic_768 or its admitted v2 projection contract.
 */
export function getActiveSemanticVectorLane(): VectorLaneContract & { dimension: SemanticDimension } {
  const lane = VECTOR_LANES.source768;
  if (
    lane.kind !== 'semantic' ||
    lane.status !== 'active' ||
    lane.dimension !== SEMANTIC_DIMENSION ||
    lane.collection !== 'codebase_chunks_768_v2'
  ) {
    throw new Error('SEMANTIC_768_LANE_INVARIANT_BROKEN: active semantic lane must be codebase_chunks_768_v2/content/768');
  }
  return lane as VectorLaneContract & { dimension: SemanticDimension };
}
