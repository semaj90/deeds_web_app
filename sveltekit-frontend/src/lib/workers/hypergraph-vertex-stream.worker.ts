/**
 * hypergraph-vertex-stream.worker.ts
 *
 * Off-thread Web Worker consumer for `pack_vertex_stream_for_web_worker_v2` binary streams.
 * Zero-copy transfers unpacked TypedArrays back to Three.js / WebGPU renderers.
 *
 * NEXT STEP:
 *   Import via `new Worker(new URL('./hypergraph-vertex-stream.worker.ts', import.meta.url), { type: 'module' })`
 *   from `WebGPUTopologyRenderer.svelte` or `code-intel/topology/+page.svelte`.
 */

import {
	VertexStreamChunkAccumulator,
	unpackHypergraphVertexStreamV2,
} from '../gpu/hypergraph-vertex-stream-v2.js';

export type HypergraphVertexWorkerRequest =
	| { kind?: 'batch'; requestId: string; buffer: ArrayBuffer }
	| { kind: 'chunk'; requestId: string; chunk: Uint8Array }
	| { kind: 'flush'; requestId: string };

const workerSelf = self as unknown as Worker;
const accumulators = new Map<string, VertexStreamChunkAccumulator>();

workerSelf.onmessage = (event: MessageEvent<HypergraphVertexWorkerRequest>) => {
	const msg = event.data;
	const { requestId } = msg;
	try {
		if (msg.kind === 'chunk') {
			let acc = accumulators.get(requestId);
			if (!acc) {
				acc = new VertexStreamChunkAccumulator();
				accumulators.set(requestId, acc);
			}
			const unpacked = acc.push(msg.chunk);
			if (unpacked) {
				workerSelf.postMessage({ ok: true, requestId, ...unpacked }, [
					unpacked.positions.buffer,
					unpacked.manifoldWeights.buffer,
					unpacked.tileUvs.buffer,
					unpacked.featureMasks.buffer,
					unpacked.charProgress.buffer,
				]);
			}
			return;
		}
		if (msg.kind === 'flush') {
			const acc = accumulators.get(requestId);
			if (acc) {
				acc.flushCheck();
				accumulators.delete(requestId);
			}
			workerSelf.postMessage({ ok: true, requestId, done: true });
			return;
		}

		const unpacked = unpackHypergraphVertexStreamV2(msg.buffer);
		workerSelf.postMessage(
			{
				ok: true,
				requestId,
				...unpacked,
			},
			[
				unpacked.positions.buffer,
				unpacked.manifoldWeights.buffer,
				unpacked.tileUvs.buffer,
				unpacked.featureMasks.buffer,
				unpacked.charProgress.buffer,
			]
		);
	} catch (error) {
		accumulators.delete(requestId);
		workerSelf.postMessage({
			ok: false,
			requestId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
};
