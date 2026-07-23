export const QDRANT_COLLECTION_REGISTRY = {
  canonical: 'codebase_chunks_384_hybrid',
  legacySource: 'codebase_chunks_768',
  graphProjection: 'codebase_graph_projection',
} as const;

export const QDRANT_VECTOR_NAMES = {
  denseRetrieval: 'dense_retrieval',
  summaryRoute: 'summary_route',
  latentRoute: 'latent_route',
  lateInteraction: 'late_interaction',
} as const;

export const QDRANT_SPARSE_VECTOR_NAME = 'bm42_sparse' as const;

export function resolveAtlasQdrantDefaultCollection(): string {
  return QDRANT_COLLECTION_REGISTRY.canonical;
}

export function resolveAtlasQdrantLegacySourceCollection(): string {
  return QDRANT_COLLECTION_REGISTRY.legacySource;
}

export function resolveAtlasQdrantDenseVectorName(): string {
  return QDRANT_VECTOR_NAMES.denseRetrieval;
}

export function resolveAtlasQdrantSummaryRouteVectorName(): string {
  return QDRANT_VECTOR_NAMES.summaryRoute;
}

export function resolveAtlasQdrantLatentRouteVectorName(): string {
  return QDRANT_VECTOR_NAMES.latentRoute;
}

export function resolveAtlasQdrantSparseVectorName(): string {
  return QDRANT_SPARSE_VECTOR_NAME;
}
