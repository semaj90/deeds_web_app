import {
  EMBEDDINGGEMMA_FULL768_CONTRACT,
  EMBEDDINGGEMMA_FULL768_V1,
  ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1,
  EMBEDDINGGEMMA_PREFIX384_CONTRACT,
  type EmbeddingGemmaProjectionContract,
} from './embeddinggemma-prefix384.js';

export type VectorIndexBackend =
  | 'duckdb-snapshot'
  | 'qdrant-hnsw'
  | 'qdrant-bm42'
  | 'turbovec-shadow'
  | 'bruteforce-reference'
  | 'kmeans'
  | 'som'
  | 'redis-cache';

export type VectorIndexRegistryEntry = {
  id: string;
  name: string;
  backend: VectorIndexBackend;
  contractVersion: string;
  vectorContract?: EmbeddingGemmaProjectionContract;
  snapshotLimit?: number;
  collection?: string;
  indexKind?: 'dense' | 'hybrid' | 'shadow' | 'reference';
  buildScript?: string;
  warmers?: string[];
  notes?: string;
};

export const VECTOR_INDEX_REGISTRY = {
  vectorSnapshot5k: {
    id: 'vector-snapshot-5k',
    name: 'Frozen 5k packet vector snapshot',
    backend: 'duckdb-snapshot',
    contractVersion: ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1,
    vectorContract: EMBEDDINGGEMMA_PREFIX384_CONTRACT,
    snapshotLimit: 5000,
    collection: 'vector_snapshot_packets',
    indexKind: 'reference',
    buildScript: 'scripts/atlas/duckdb/freeze-vector-snapshot.mts',
    notes: 'Deterministic 5,000-packet freeze for parity, brute-force reference, and downstream index builds.',
  },
  qdrantHybrid: {
    id: 'qdrant-codebase-chunks-384-hybrid',
    name: 'Qdrant HNSW + BM42 hybrid retrieval index',
    backend: 'qdrant-hnsw',
    contractVersion: ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1,
    vectorContract: EMBEDDINGGEMMA_PREFIX384_CONTRACT,
    collection: 'codebase_chunks_384_hybrid',
    indexKind: 'hybrid',
    buildScript: 'scripts/atlas/restore-qdrant-384-from-postgres.mjs',
    notes: 'Primary dense+sparse retrieval lane.',
  },
  qdrantSource768: {
    id: 'qdrant-codebase-chunks-768',
    name: 'Qdrant source 768-dim semantic index',
    backend: 'qdrant-hnsw',
    contractVersion: EMBEDDINGGEMMA_FULL768_V1,
    vectorContract: EMBEDDINGGEMMA_FULL768_CONTRACT,
    collection: 'codebase_chunks_768',
    indexKind: 'dense',
    buildScript: 'scripts/atlas/restore-qdrant-768-from-postgres.mjs',
    notes: 'Native EmbeddingGemma source lane for full-dimension search and adaptive reranking.',
  },
  qdrantDense: {
    id: 'qdrant-codebase-chunks-384',
    name: 'Qdrant dense fallback retrieval index',
    backend: 'qdrant-hnsw',
    contractVersion: ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1,
    vectorContract: EMBEDDINGGEMMA_PREFIX384_CONTRACT,
    collection: 'codebase_chunks_384',
    indexKind: 'dense',
    buildScript: 'scripts/atlas/restore-qdrant-384-from-postgres.mjs',
    notes: 'Transitional dense-only fallback.',
  },
  turbovecShadow: {
    id: 'turbovec-shadow-384',
    name: 'TurboVec shadow index',
    backend: 'turbovec-shadow',
    contractVersion: ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1,
    vectorContract: EMBEDDINGGEMMA_PREFIX384_CONTRACT,
    collection: 'vector_snapshot_packets',
    indexKind: 'shadow',
    buildScript: 'scripts/atlas/turbovec-gpu-consolidate.mjs',
    notes: 'Shadow ANN lane built from the same frozen snapshot as Qdrant.',
  },
  bruteforceReference: {
    id: 'bruteforce-reference-384',
    name: 'Brute-force reference index',
    backend: 'bruteforce-reference',
    contractVersion: ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1,
    vectorContract: EMBEDDINGGEMMA_PREFIX384_CONTRACT,
    collection: 'vector_snapshot_packets',
    indexKind: 'reference',
    notes: 'Used as the ground-truth comparator for Qdrant/TurboVec parity.',
  },
  kmeans384: {
    id: 'kmeans-384',
    name: 'K-means 384-vector clustering lane',
    backend: 'kmeans',
    contractVersion: ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1,
    vectorContract: EMBEDDINGGEMMA_PREFIX384_CONTRACT,
    collection: 'vector_snapshot_packets',
    indexKind: 'reference',
    buildScript: 'scripts/atlas/train-turbovec-kmeans.mjs',
  },
  som20x20: {
    id: 'som-20x20-384',
    name: 'SOM 20x20 routing lane',
    backend: 'som',
    contractVersion: ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1,
    vectorContract: EMBEDDINGGEMMA_PREFIX384_CONTRACT,
    collection: 'vector_snapshot_packets',
    indexKind: 'reference',
    buildScript: 'scripts/atlas/run-som-on-chunks.mjs',
  },
  redisCentroidWarm: {
    id: 'redis-centroid-som-warm',
    name: 'Redis centroid and SOM warm cache',
    backend: 'redis-cache',
    contractVersion: ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1,
    vectorContract: EMBEDDINGGEMMA_PREFIX384_CONTRACT,
    collection: 'vector_snapshot_packets',
    indexKind: 'shadow',
    warmers: [
      'scripts/atlas/warm-centroid-cache.mjs',
      'scripts/atlas/warm-turbovec-centroids-redis.mjs',
    ],
  },
} as const satisfies Record<string, VectorIndexRegistryEntry>;

export type VectorIndexRegistryKey = keyof typeof VECTOR_INDEX_REGISTRY;

export function getVectorIndexRegistryEntry(key: VectorIndexRegistryKey): VectorIndexRegistryEntry {
  return VECTOR_INDEX_REGISTRY[key];
}

export function listVectorIndexRegistryEntries(): VectorIndexRegistryEntry[] {
  return Object.values(VECTOR_INDEX_REGISTRY);
}
