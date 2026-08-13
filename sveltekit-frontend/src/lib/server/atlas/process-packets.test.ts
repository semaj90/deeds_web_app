import { describe, expect, it } from 'vitest';

import { buildAtlasProcessPacket } from './process-packets.js';

describe('process-packets', () => {
	it('materializes deterministic process packets and qdrant payloads', () => {
		const input = {
			processId: 'process:search-route',
			name: 'searchRoute',
			sourceRefs: ['src/a.ts', 'src/b.ts', 'src/a.ts'],
			stepSymbolIds: ['step:1', 'step:2', 'step:2'],
			dbTables: ['atlas_packets', 'atlas_context_manifests'],
			tools: ['glob', 'read'],
			endpoints: ['/api/search'],
			caches: ['valkey:hot'],
			graphRevision: 'graph:rev:1',
		};

		const first = buildAtlasProcessPacket(input);
		const second = buildAtlasProcessPacket(input);

		expect(first.canonicalHash).toBe(second.canonicalHash);
		expect(first.packet.packetKey).toBe(second.packet.packetKey);
		expect(first.packet.processHash).toBe(second.packet.processHash);
		expect(first.packet.stepSymbolIds).toEqual(['step:1', 'step:2']);
		expect(first.packet.sourceRefs).toEqual(['src/a.ts', 'src/b.ts']);
		expect(first.packet.qdrantPayload).toEqual(second.packet.qdrantPayload);
		expect(first.packet.qdrantPayload).toMatchObject({
			packet_key: expect.any(String),
			process_id: 'process:search-route',
			graph_revision: 'graph:rev:1',
			process_hash: expect.any(String),
		});
	});
});
