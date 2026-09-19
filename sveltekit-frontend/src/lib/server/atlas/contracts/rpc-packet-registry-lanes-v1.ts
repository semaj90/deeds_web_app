import {
	PacketRegistryLaneDescriptorV1Schema,
	type PacketRegistryLaneDescriptorV1,
} from './rpc-packet-registry-v1.js';

/**
 * Read-only lane census derived from the current PostgreSQL/Qdrant contracts.
 * Status is deliberately conservative: a configured index is not proof of
 * complete source lineage or projection parity.
 */
export function buildPacketRegistryLaneDescriptorsV1(): PacketRegistryLaneDescriptorV1[] {
	return [
		PacketRegistryLaneDescriptorV1Schema.parse({
			laneId: 'postgres.bm25', kind: 'bm25_pg_fts', owner: 'postgresql', status: 'READY',
			representationId: 'lexical_bm25', representationRevision: 'postgresql-18@1', modelRevision: null,
			collection: null, vectorName: null, tags: ['canonical', 'postgresql', 'bm25'],
			indexAlgorithm: 'GIN_FTS', indexRevision: 'idx_codebase_chunk_bm25_search@1',
			projectionChecksum: null, writePolicy: 'READ_ONLY',
		}),
		PacketRegistryLaneDescriptorV1Schema.parse({
			laneId: 'postgres.pgvector.semantic_768', kind: 'pgvector', owner: 'postgresql', status: 'DEGRADED',
			representationId: 'semantic_768', representationRevision: 'semantic_768@1', modelRevision: 'embeddinggemma@1',
			collection: null, vectorName: 'content_embedding_768', tags: ['canonical', 'postgresql', 'pgvector', '768'],
			indexAlgorithm: 'HNSW', indexRevision: 'idx_codebase_chunk_content_embedding_768_hnsw@1',
			projectionChecksum: null, writePolicy: 'READ_ONLY',
		}),
		PacketRegistryLaneDescriptorV1Schema.parse({
			laneId: 'qdrant.semantic_768', kind: 'qdrant_dense', owner: 'qdrant', status: 'DEGRADED',
			representationId: 'semantic_768', representationRevision: 'semantic_768@1', modelRevision: 'embeddinggemma@1',
			collection: 'codebase_chunks_768', vectorName: 'content', tags: ['projection', 'mirror', '768'],
			indexAlgorithm: 'HNSW', indexRevision: 'qdrant@1', projectionChecksum: null, writePolicy: 'PROJECTION_ONLY',
		}),
		PacketRegistryLaneDescriptorV1Schema.parse({
			laneId: 'qdrant.sparse', kind: 'qdrant_sparse', owner: 'qdrant', status: 'UNPROVEN',
			representationId: 'sparse', representationRevision: null, modelRevision: null,
			collection: null, vectorName: null, tags: ['projection', 'sparse'], indexAlgorithm: 'HNSW',
			indexRevision: null, projectionChecksum: null, writePolicy: 'PROJECTION_ONLY',
		}),
		PacketRegistryLaneDescriptorV1Schema.parse({
			laneId: 'cuvs.rapids', kind: 'cuvs_rapids', owner: 'wsl2-8098', status: 'UNPROVEN',
			representationId: 'semantic_768', representationRevision: 'semantic_768@1', modelRevision: 'embeddinggemma@1',
			collection: null, vectorName: null, tags: ['optional', 'gpu', 'rapids', 'cuvs'], indexAlgorithm: 'CAGRA',
			indexRevision: null, projectionChecksum: null, writePolicy: 'PROJECTION_ONLY',
		}),
		PacketRegistryLaneDescriptorV1Schema.parse({
			laneId: 'fastapi.gpu', kind: 'fastapi_gpu', owner: 'fastapi-gpu', status: 'UNPROVEN',
			representationId: 'semantic_768', representationRevision: 'semantic_768@1', modelRevision: 'embeddinggemma@1',
			collection: null, vectorName: null, tags: ['optional', 'gpu', 'fastapi'], indexAlgorithm: 'NONE',
			indexRevision: null, projectionChecksum: null, writePolicy: 'PROJECTION_ONLY',
		}),
	];
}

