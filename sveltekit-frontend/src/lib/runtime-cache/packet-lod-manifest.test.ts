import { describe, expect, it } from 'vitest';
import { buildPacketLodCacheKey, parsePacketLodManifest } from './packet-lod-manifest';

describe('packet LOD manifest', () => {
	it('validates a packet cache manifest', () => {
		const manifest = parsePacketLodManifest({
			packet_key: 'packet:abc123',
			source_ref: 'src/lib/server/retrieval/search.ts',
			feature_id: 'retrieval.search',
			domain_class: 'retrieval',
			som_cell: '8:13',
			community_id: 'community:42',
			qdrant_point_id: '2f7e9d',
			summary_hash: '1234567890abcdef',
			msgpack_ref: 'memory/packets/hyperrag/packet:abc123.msgpack',
			lod_level: 2,
			cache_key: 'sw:lod:packet:packet:abc123:level:2',
			updated_at: new Date('2026-07-10T00:00:00.000Z').toISOString(),
		});

		expect(manifest.som_cell).toBe('8:13');
		expect(buildPacketLodCacheKey(manifest)).toBe('sw:lod:packet:packet:abc123:level:2');
	});
});

