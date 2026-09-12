import {
  EMBEDDINGGEMMA_FULL768_CONTRACT,
  EMBEDDINGGEMMA_FULL768_V1,
  ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1,
  EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT,
  type EmbeddingGemmaProjectionContract,
} from './embeddinggemma-contracts.js';

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
  lifecycle?: 'ACTIVE' | 'REFERENCE_ONLY' | 'LEGACY_MIGRATION_ONLY';
  buildScript?: string;
  warmers?: string[];
  notes?: string;
};

export const VECTOR_INDEX_REGISTRY = {
  vectorSnapshot5k: {
    id: 'vector-snapshot-5k',
    name: 'Frozen 5k legacy 384 packet vector snapshot',
    backend: 'duckdb-snapshot',
    contractVersion: ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1,
    vectorContract: EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT,
    snapshotLimit: 5000,
    collection: 'vector_snapshot_packets',
    indexKind: 'reference',
    lifecycle: 'LEGACY_MIGRATION_ONLY',
    buildScript: 'scripts/atlas/duckdb/freeze-vector-snapshot.mts',
    notes: 'Historical Atlas 768->384 direct-slice replay only. 384 is not an EmbeddingGemma MRL target and is never semantic authority.',
  },
  vectorSnapshot5k768: {
    id: 'vector-snapshot-5k-768',
    name: 'Frozen 5k semantic_768 packet vector snapshot',
    backend: 'duckdb-snapshot',
    contractVersion: EMBEDDINGGEMMA_FULL768_V1,
    vectorContract: EMBEDDINGGEMMA_FULL768_CONTRACT,
    snapshotLimit: 5000,
    collection: 'vector_snapshot_packets_5k_768',
    indexKind: 'reference',
    lifecycle: 'REFERENCE_ONLY',
    buildScript: 'scripts/atlas/duckdb/freeze-vector-snapshot-5k-768.mts',
    notes: 'Deterministic 5,000-packet semantic_768 reference snapshot; derived indexes remain rebuildable and non-canonical.',
  },
  qdrantHybrid: {
    id: 'qdrant-codebase-chunks-384-hybrid',
    name: 'Legacy Atlas 384 Qdrant HNSW + BM42 hybrid index',
    backend: 'qdrant-hnsw',
    contractVersion: ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1,
    vectorContract: EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT,
    collection: 'codebase_chunks_384_hybrid',
    indexKind: 'hybrid',
    lifecycle: 'LEGACY_MIGRATION_ONLY',
    buildScript: 'scripts/atlas/restore-qdrant-384-from-postgres.mjs',
    notes: 'Migration/reference only. Canonical production semantic retrieval is codebase_chunks_768_v2.',
  },
  qdrantSource768V2: {
    id: 'qdrant-codebase-chunks-768-v2',
    name: 'Qdrant semantic_768 comparison challenger',
    backend: 'qdrant-hnsw',
    contractVersion: EMBEDDINGGEMMA_FULL768_V1,
    vectorContract: EMBEDDINGGEMMA_FULL768_CONTRACT,
    collection: 'codebase_chunks_768_v2',
    indexKind: 'dense',
    lifecycle: 'REFERENCE_ONLY',
    buildScript: 'scripts/atlas/phase108e-semantic-search-proof.mjs',
    notes: 'Comparison/challenger projection retained for parity evaluation; PostgreSQL owns canonical identity and lineage.',
  },
  qdrantSource768: {
    id: 'qdrant-codebase-chunks-768',
    name: 'Qdrant declared semantic_768 projection',
    backend: 'qdrant-hnsw',
    contractVersion: EMBEDDINGGEMMA_FULL768_V1,
    vectorContract: EMBEDDINGGEMMA_FULL768_CONTRACT,
    collection: 'codebase_chunks_768',
    indexKind: 'dense',
    lifecycle: 'ACTIVE',
    buildScript: 'scripts/atlas/restore-qdrant-768-from-postgres.mjs',
    notes: 'Declared rebuildable semantic_768 projection; PostgreSQL owns canonical identity and lineage. v2 remains a comparison challenger.',
  },
  qdrantDense: {
    id: 'qdrant-codebase-chunks-384',
    name: 'Legacy Atlas 384 dense fallback index',
    backend: 'qdrant-hnsw',
    contractVersion: ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1,
    vectorContract: EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT,
    collection: 'codebase_chunks_384',
    indexKind: 'reference',
    lifecycle: 'LEGACY_MIGRATION_ONLY',
    buildScript: 'scripts/atlas/restore-qdrant-384-from-postgres.mjs',
    notes: 'Transitional replay-only collection. New reads/writes must use semantic_768.',
  },
  turbovecShadow: {
    id: 'turbovec-shadow-384',
    name: 'Legacy 384 TurboVec shadow index',
    backend: 'turbovec-shadow',
    contractVersion: ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1,
    vectorContract: EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT,
    collection: 'vector_snapshot_packets',
    indexKind: 'shadow',
    lifecycle: 'LEGACY_MIGRATION_ONLY',
    buildScript: 'scripts/atlas/turbovec-gpu-consolidate.mjs',
    notes: 'Historical 384 replay only; no production vote.',
  },
  bruteforceReference: {
    id: 'bruteforce-reference-384',
    name: 'Legacy 384 brute-force reference index',
    backend: 'bruteforce-reference',
    contractVersion: ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1,
    vectorContract: EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT,
    collection: 'vector_snapshot_packets',
    indexKind: 'reference',
    lifecycle: 'LEGACY_MIGRATION_ONLY',
    notes: 'Ground-truth comparator for historical 384 replay only.',
  },
  kmeans384: {
    id: 'kmeans-384',
    name: 'Legacy 384 K-means clustering lane',
    backend: 'kmeans',
    contractVersion: ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1,
    vectorContract: EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT,
    collection: 'vector_snapshot_packets',
    indexKind: 'reference',
    lifecycle: 'LEGACY_MIGRATION_ONLY',
    buildScript: 'scripts/atlas/train-turbovec-kmeans.mjs',
  },
  som20x20: {
    id: 'som-20x20-384',
    name: 'Legacy 384 SOM 20x20 routing lane',
    backend: 'som',
    contractVersion: ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1,
    vectorContract: EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT,
    collection: 'vector_snapshot_packets',
    indexKind: 'reference',
    lifecycle: 'LEGACY_MIGRATION_ONLY',
    buildScript: 'scripts/atlas/run-som-on-chunks.mjs',
  },
  redisCentroidWarm: {
    id: 'redis-centroid-som-warm',
    name: 'Legacy 384 Redis centroid/SOM warm cache',
    backend: 'redis-cache',
    contractVersion: ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1,
    vectorContract: EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT,
    collection: 'vector_snapshot_packets',
    indexKind: 'shadow',
    lifecycle: 'LEGACY_MIGRATION_ONLY',
    warmers: [
      'scripts/atlas/warm-centroid-cache.mjs',
      'scripts/atlas/warm-turbovec-centroids-redis.mjs',
    ],
    notes: 'Legacy 384 cache warmers only; never semantic_768 authority.',
  },
} as const satisfies Record<string, VectorIndexRegistryEntry>;

export type VectorIndexRegistryKey = keyof typeof VECTOR_INDEX_REGISTRY;

export function getVectorIndexRegistryEntry(key: VectorIndexRegistryKey): VectorIndexRegistryEntry {
  return VECTOR_INDEX_REGISTRY[key];
}

export function listVectorIndexRegistryEntries(): VectorIndexRegistryEntry[] {
  return Object.values(VECTOR_INDEX_REGISTRY);
}
