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
  dimension: 384 | 768 | 64 | 128;
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
  retrieval384: {
    laneId: 'embeddinggemma-prefix384',
    kind: 'retrieval',
    role: 'canonical',
    modelId: 'embeddinggemma:latest',
    vectorName: 'content',
    collection: 'codebase_chunks_384_hybrid',
    dimension: 384,
    projection: 'direct_slice',
    normalization: 'l2',
    status: 'active',
    notes: 'Prefix-sliced canonical retrieval lane used for dense Qdrant search.',
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
