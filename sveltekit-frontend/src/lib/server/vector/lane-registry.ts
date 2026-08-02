/**
 * Semantic vectors and latent topology projections are different contracts.
 * Never share one dimension union between them — a 128/64-dim topology
 * projection is not a valid semantic embedding dimension and vice versa.
 */
export type SemanticDimension = 768;
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
  dimension: 768 | 64 | 128;
  projection: 'none' | 'direct_slice' | 'autoencoder' | 'latent';
  normalization: 'none' | 'l2';
  status: 'active' | 'partial' | 'legacy' | 'blocked';
  notes: string;
}

export const VECTOR_LANES = {
  source768: {
    laneId: 'embeddinggemma-768d',
    kind: 'semantic',
    role: 'source',
    modelId: 'embeddinggemma:latest',
    vectorName: 'content',
    collection: 'codebase_chunks_768',
    dimension: 768,
    projection: 'none',
    normalization: 'l2',
    status: 'active',
    notes: 'Native EmbeddingGemma source lane for full-dimension embeddings.',
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
    vectorName: 'latent_64',
    collection: 'codebase_topology_64',
    dimension: 64,
    projection: 'latent',
    normalization: 'l2',
    status: 'partial',
    notes: 'Derived routing lane for KMeans / SOM / TurboVec acceleration only.',
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
 * The single active semantic lane. Use this instead of indexing VECTOR_LANES
 * directly when the caller needs the canonical semantic embedding contract —
 * it fails loudly if the registry's active semantic lane ever changes shape
 * instead of silently returning whatever is at `source768`.
 */
export function getActiveSemanticVectorLane(): VectorLaneContract & { dimension: SemanticDimension } {
  const lane = VECTOR_LANES.source768;
  if (lane.kind !== 'semantic' || lane.status !== 'active' || lane.dimension !== 768) {
    throw new Error('SEMANTIC_768_LANE_INVARIANT_BROKEN: source768 is no longer the active 768-dim semantic lane');
  }
  return lane as VectorLaneContract & { dimension: SemanticDimension };
}
