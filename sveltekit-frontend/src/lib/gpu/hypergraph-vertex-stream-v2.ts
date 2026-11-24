/**
 * hypergraph-vertex-stream-v2.ts
 *
 * Browser/Worker decoder for the 32-byte (8 x float32-le) vertex stream emitted by
 * `python/atlas_external_doc_hypergraph_v2.py::pack_vertex_stream_for_web_worker_v2`.
 *
 * Vertex layout (32 bytes per vertex):
 *   [0] world_x        (Mode-7 affine projected X)
 *   [1] world_y        (Mode-7 affine projected Y)
 *   [2] manifold_z     (cluster centroid semantic depth)
 *   [3] manifold_w     (GRPO / PUCT policy reward score)
 *   [4] tile_u         (2D atlas texture U)
 *   [5] tile_v         (2D atlas texture V)
 *   [6] feature_bitmask (integer bitmask encoded as float32)
 *   [7] char_progress  (0.0..1.0 typewriter reveal scalar)
 *
 * NEXT STEP (Consumer Integration):
 *   1. Add an SSR/API endpoint (e.g. `/api/atlas/hypergraph/vertex-stream`) that invokes
 *      `pack_vertex_stream_for_web_worker_v2` and returns `application/octet-stream`.
 *   2. Instantiate `hypergraph-vertex-stream.worker.ts` inside `WebGPUTopologyRenderer.svelte`
 *      or `code-intel/topology/+page.svelte`, transfer the `ArrayBuffer`, and attach the
 *      returned `Float32Array` attributes to a Three.js `BufferGeometry` / WebGPU vertex buffer.
 *   3. Drive `uCharProgress` shader uniform or per-vertex `aCharProgress` attribute from
 *      `TypewriterResponse.svelte` streaming progress events.
 */

export const HYPERGRAPH_VERTEX_STRIDE_FLOATS = 8;
export const HYPERGRAPH_VERTEX_STRIDE_BYTES = 32;

export interface UnpackedHypergraphVertexBuffersV2 {
	vertexCount: number;
	positions: Float32Array; // vec3: world_x, world_y, manifold_z
	manifoldWeights: Float32Array; // float: manifold_w
	tileUvs: Float32Array; // vec2: tile_u, tile_v
	featureMasks: Uint32Array; // uint32: feature_bitmask
	charProgress: Float32Array; // float: 0.0..1.0 typewriter reveal
}

export function unpackHypergraphVertexStreamV2(buffer: ArrayBuffer): UnpackedHypergraphVertexBuffersV2 {
	if (buffer.byteLength % HYPERGRAPH_VERTEX_STRIDE_BYTES !== 0) {
		throw new Error(
			`HYPERGRAPH_VERTEX_STREAM_ALIGNMENT_ERROR: byteLength=${buffer.byteLength} must be a multiple of ${HYPERGRAPH_VERTEX_STRIDE_BYTES}`
		);
	}

	const vertexCount = buffer.byteLength / HYPERGRAPH_VERTEX_STRIDE_BYTES;
	const view = new DataView(buffer);

	const positions = new Float32Array(vertexCount * 3);
	const manifoldWeights = new Float32Array(vertexCount);
	const tileUvs = new Float32Array(vertexCount * 2);
	const featureMasks = new Uint32Array(vertexCount);
	const charProgress = new Float32Array(vertexCount);

	for (let i = 0; i < vertexCount; i++) {
		const base = i * HYPERGRAPH_VERTEX_STRIDE_BYTES;
		const worldX = view.getFloat32(base + 0, true);
		const worldY = view.getFloat32(base + 4, true);
		const manifoldZ = view.getFloat32(base + 8, true);
		const manifoldW = view.getFloat32(base + 12, true);
		const tileU = view.getFloat32(base + 16, true);
		const tileV = view.getFloat32(base + 20, true);
		const bitmaskU32 = view.getUint32(base + 24, true);
		const progress = view.getFloat32(base + 28, true);

		positions[i * 3 + 0] = worldX;
		positions[i * 3 + 1] = worldY;
		positions[i * 3 + 2] = manifoldZ;

		manifoldWeights[i] = manifoldW;
		tileUvs[i * 2 + 0] = tileU;
		tileUvs[i * 2 + 1] = tileV;
		featureMasks[i] = bitmaskU32;
		charProgress[i] = Math.max(0, Math.min(1, progress));
	}

	return {
		vertexCount,
		positions,
		manifoldWeights,
		tileUvs,
		featureMasks,
		charProgress,
	};
}

/**
 * Buffers trailing remainder bytes (< 32 bytes) across HTTP ReadableStream chunks
 * so a vertex split mid-float across network boundaries never throws alignment errors.
 */
export class VertexStreamChunkAccumulator {
	private remainder: Uint8Array = new Uint8Array(0);

	push(chunk: Uint8Array): UnpackedHypergraphVertexBuffersV2 | null {
		const combined = new Uint8Array(this.remainder.byteLength + chunk.byteLength);
		combined.set(this.remainder, 0);
		combined.set(chunk, this.remainder.byteLength);

		const usableBytes = Math.floor(combined.byteLength / HYPERGRAPH_VERTEX_STRIDE_BYTES) * HYPERGRAPH_VERTEX_STRIDE_BYTES;
		this.remainder = combined.slice(usableBytes);

		if (usableBytes === 0) return null;
		const alignedSlice = combined.buffer.slice(combined.byteOffset, combined.byteOffset + usableBytes);
		return unpackHypergraphVertexStreamV2(alignedSlice);
	}

	flushCheck(): void {
		if (this.remainder.byteLength !== 0) {
			throw new Error(
				`HYPERGRAPH_VERTEX_STREAM_TRAILING_BYTES: ${this.remainder.byteLength} unaligned bytes at EOF`
			);
		}
	}
}
