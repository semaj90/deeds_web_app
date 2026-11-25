/**
 * hypergraph-vertex-client.ts
 *
 * Browser-side helper connecting `/api/atlas/hypergraph/vertex-stream` (or Python
 * `pack_vertex_stream_for_web_worker_v2` binary responses) to `hypergraph-vertex-stream.worker.ts`.
 *
 * NEXT STEP:
 *   Call `streamHypergraphVerticesToWorker()` from `WebGPUTopologyRenderer.svelte` or
 *   `code-intel/topology/+page.svelte` and bind `positions`, `tileUvs`, and `charProgress`
 *   to Three.js `BufferAttribute`s.
 */

import type { UnpackedHypergraphVertexBuffersV2 } from './hypergraph-vertex-stream-v2.js';

export function createHypergraphVertexWorker(): Worker {
	return new Worker(
		new URL('../workers/hypergraph-vertex-stream.worker.ts', import.meta.url),
		{ type: 'module' }
	);
}

export function streamHypergraphVerticesToWorker(
	worker: Worker,
	buffer: ArrayBuffer,
	requestId = `hg-${Date.now()}`
): Promise<UnpackedHypergraphVertexBuffersV2> {
	return new Promise((resolve, reject) => {
		const onMessage = (event: MessageEvent) => {
			const data = event.data;
			if (!data || data.requestId !== requestId) return;
			worker.removeEventListener('message', onMessage);
			worker.removeEventListener('error', onError);
			if (!data.ok) {
				reject(new Error(String(data.error ?? 'HYPERGRAPH_VERTEX_WORKER_ERROR')));
				return;
			}
			resolve({
				vertexCount: data.vertexCount,
				positions: data.positions,
				manifoldWeights: data.manifoldWeights,
				tileUvs: data.tileUvs,
				featureMasks: data.featureMasks,
				charProgress: data.charProgress,
			});
		};

		const onError = (err: ErrorEvent) => {
			worker.removeEventListener('message', onMessage);
			worker.removeEventListener('error', onError);
			reject(new Error(err.message || 'HYPERGRAPH_VERTEX_WORKER_CRASHED'));
		};

		worker.addEventListener('message', onMessage);
		worker.addEventListener('error', onError);
		worker.postMessage({ requestId, buffer }, [buffer]);
	});
}
