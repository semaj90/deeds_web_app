import { describe, expect, it } from 'vitest';
import {
	HYPERGRAPH_VERTEX_STRIDE_BYTES,
	VertexStreamChunkAccumulator,
	unpackHypergraphVertexStreamV2,
} from './hypergraph-vertex-stream-v2.js';

describe('unpackHypergraphVertexStreamV2', () => {
	it('unpacks 32-byte little-endian vertex stream and preserves uint32 bitmasks without NaN corruption', () => {
		const buf = new ArrayBuffer(HYPERGRAPH_VERTEX_STRIDE_BYTES * 2);
		const view = new DataView(buf);

		// Vertex 0: NaN-like uint32 bitmask 0x7fc0001b must survive intact via uint32-le
		[2.0, 3.0, 0.3, 0.7, 2.0, 3.0].forEach((val, idx) => view.setFloat32(idx * 4, val, true));
		view.setUint32(24, 0x7fc0001b, true);
		view.setFloat32(28, 0.75, true);

		// Vertex 1: char_progress=1.5 (clamped to 1.0)
		[4.0, 5.0, 0.3, 0.7, 4.0, 5.0].forEach((val, idx) => view.setFloat32(32 + idx * 4, val, true));
		view.setUint32(32 + 24, 27, true);
		view.setFloat32(32 + 28, 1.5, true);

		const unpacked = unpackHypergraphVertexStreamV2(buf);

		expect(unpacked.vertexCount).toBe(2);
		expect(Array.from(unpacked.positions).map((x) => Number(x.toFixed(2)))).toEqual([
			2.0, 3.0, 0.3, 4.0, 5.0, 0.3,
		]);
		expect(Array.from(unpacked.manifoldWeights).map((x) => Number(x.toFixed(2)))).toEqual([0.7, 0.7]);
		expect(Array.from(unpacked.tileUvs)).toEqual([2.0, 3.0, 4.0, 5.0]);
		expect(Array.from(unpacked.featureMasks)).toEqual([0x7fc0001b, 27]);
		expect(Array.from(unpacked.charProgress)).toEqual([0.75, 1.0]);
	});

	it('buffers split ReadableStream chunks across 32-byte vertex boundaries', () => {
		const buf = new ArrayBuffer(HYPERGRAPH_VERTEX_STRIDE_BYTES * 2);
		const view = new DataView(buf);
		view.setFloat32(0, 1.0, true);
		view.setUint32(24, 0xdeadbeef, true);
		view.setFloat32(32, 2.0, true);
		view.setUint32(32 + 24, 0x0000001f, true);

		const bytes = new Uint8Array(buf);
		const acc = new VertexStreamChunkAccumulator();

		// Split 64 bytes into 17 + 47 bytes (mid-vertex split)
		expect(acc.push(bytes.slice(0, 17))).toBeNull();
		const result = acc.push(bytes.slice(17));
		expect(result).not.toBeNull();
		expect(result!.vertexCount).toBe(2);
		expect(Array.from(result!.featureMasks)).toEqual([0xdeadbeef, 0x0000001f]);
		expect(() => acc.flushCheck()).not.toThrow();
	});

	it('fails closed on unaligned vertex buffer length', () => {
		const badBuf = new ArrayBuffer(31);
		expect(() => unpackHypergraphVertexStreamV2(badBuf)).toThrow(/HYPERGRAPH_VERTEX_STREAM_ALIGNMENT_ERROR/);
	});
});
