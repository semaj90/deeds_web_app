import { describe, expect, it } from 'vitest';
import { unpackHypergraphVertexStreamV2 } from '$lib/gpu/hypergraph-vertex-stream-v2.js';
import { GET, POST } from './+server.js';

describe('/api/atlas/hypergraph/vertex-stream', () => {
	it('GET returns stable contract metadata offline', async () => {
		const res = await GET({} as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.schema).toBe('atlas.hypergraph-vertex-stream.v2');
		expect(body.strideBytes).toBe(32);
		expect(body.canonicalAuthority).toBe(false);
	});

	it('POST packs 32-byte little-endian binary stream and round-trips through unpackHypergraphVertexStreamV2', async () => {
		const req = new Request('http://localhost/api/atlas/hypergraph/vertex-stream', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				workspaceRevision: '74ac7d8983e',
				vertices: [
					{
						worldX: 1.5,
						worldY: -2.0,
						manifoldZ: 0.25,
						manifoldW: 0.9,
						tileU: 0.5,
						tileV: 0.75,
						featureBitmask: 27,
						charProgress: 0.6,
					},
				],
			}),
		});

		const res = await POST({ request: req } as any);
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
		expect(res.headers.get('X-Vertex-Count')).toBe('1');

		const buffer = await res.arrayBuffer();
		const unpacked = unpackHypergraphVertexStreamV2(buffer);
		expect(unpacked.vertexCount).toBe(1);
		expect(Array.from(unpacked.positions).map((x) => Number(x.toFixed(2)))).toEqual([1.5, -2.0, 0.25]);
		expect(Number(unpacked.manifoldWeights[0].toFixed(2))).toBe(0.9);
		expect(Array.from(unpacked.charProgress).map((x) => Number(x.toFixed(2)))).toEqual([0.6]);
	});

	it('POST rejects invalid payloads with 400', async () => {
		const req = new Request('http://localhost/api/atlas/hypergraph/vertex-stream', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ vertices: [] }),
		});

		const res = await POST({ request: req } as any);
		expect(res.status).toBe(400);
	});
});
