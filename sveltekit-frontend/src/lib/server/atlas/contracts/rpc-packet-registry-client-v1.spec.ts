import { describe, expect, it } from 'vitest';
import {
	mapPacketRegistryResponseV1,
	unavailablePacketRegistryResultV1,
} from './rpc-packet-registry-client-v1.js';

describe('packet registry protobufjs/tRPC mapping', () => {
	it('preserves registry identity, mirrored collection, tags, and index metadata', () => {
		const result = mapPacketRegistryResponseV1({
			entries: [{
				schema: 'atlas.rpc-packet-registry.v1', workspaceId: 'ws-1', workspaceRevision: 'wr-1',
				packetKey: 'packet-1', packetRevision: 'pr-1', sourceRef: 'src/a.ts', sourceRevision: 'sr-1',
				contentHash: 'sha256:content', registryRevision: 'registry-1', lanes: [{
					laneId: 'qdrant.semantic_768', kind: 'qdrant_dense', owner: 'qdrant', status: 'READY',
					representationId: 'semantic_768', representationRevision: 'semantic_768@1', modelRevision: 'embeddinggemma@1',
					collection: 'codebase_chunks_768', vectorName: 'content', tags: ['current', 'mirrored'],
					indexAlgorithm: 'HNSW', indexRevision: 'qdrant@1', projectionChecksum: 'sha256:projection', writePolicy: 'PROJECTION_ONLY',
				}],
			}],
			receipt: { schema: 'atlas.tool-receipt.v2', toolCallId: 'tool-1', toolName: 'atlas.packet-registry', runId: 'run-1',
				workspaceId: 'ws-1', workspaceRevision: 'wr-1', packetKey: 'packet-1', packetRevision: 'pr-1', succeeded: true,
				evidenceCount: 1, validationStatus: 'PASS', canonicalAuthority: false, writesPerformed: false,
				receiptId: 'receipt-1', receiptChecksum: 'sha256:receipt' },
		});
		expect(result.status).toBe('AVAILABLE');
		expect(result.entries[0]?.lanes[0]).toMatchObject({ collection: 'codebase_chunks_768', tags: ['current', 'mirrored'], indexAlgorithm: 'HNSW' });
	});

	it('returns a stable degraded shape when the transport has no receipt', () => {
		const result = mapPacketRegistryResponseV1({ entries: [] });
		expect(result).toMatchObject({ status: 'UNAVAILABLE', degraded: true, entries: [] });
		expect(result.receipt.writesPerformed).toBe(false);
	});

	it('provides an explicit unavailable result without fabricating identity', () => {
		const result = unavailablePacketRegistryResultV1('ATLAS_RPC_IDENTITY_INCOMPLETE');
		expect(result.receipt.errorCode).toBe('ATLAS_RPC_IDENTITY_INCOMPLETE');
		expect(result.receipt.packetRevision).toBe('');
	});
});

