import { describe, expect, it } from 'vitest';
import { buildPacketRegistryLaneDescriptorsV1 } from './rpc-packet-registry-lanes-v1.js';

describe('packet registry lane census', () => {
	it('registers canonical, mirrored, and optional executor lanes explicitly', () => {
		const lanes = buildPacketRegistryLaneDescriptorsV1();
		expect(lanes.map((lane) => lane.kind)).toEqual([
			'bm25_pg_fts', 'pgvector', 'qdrant_dense', 'qdrant_sparse', 'cuvs_rapids', 'fastapi_gpu',
		]);
		expect(lanes[0]).toMatchObject({ owner: 'postgresql', indexAlgorithm: 'GIN_FTS', writePolicy: 'READ_ONLY' });
		expect(lanes[1]).toMatchObject({ vectorName: 'content_embedding_768', indexAlgorithm: 'HNSW', status: 'DEGRADED' });
		expect(lanes[2]).toMatchObject({ collection: 'codebase_chunks_768', vectorName: 'content', writePolicy: 'PROJECTION_ONLY' });
		expect(lanes[4]).toMatchObject({ owner: 'wsl2-8098', indexAlgorithm: 'CAGRA', status: 'UNPROVEN' });
	});
});

