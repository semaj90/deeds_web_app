/**
 * Worker-thread entry for the EmbeddingGemma 2 ONNX encoders. Bundled by
 * scripts/build/build-eg2-onnx-worker.mjs into build/workers/eg2-onnx-worker.mjs;
 * the main thread talks to it only through eg2-onnx-worker-client.ts.
 */
import { parentPort } from 'node:worker_threads';
import {
	embedEvidenceAudioWithEmbeddingGemma2OnnxV1,
	embedEvidenceImageWithEmbeddingGemma2OnnxV1,
	embedEvidenceTextWithEmbeddingGemma2OnnxV1,
} from './embeddinggemma2-onnx-image-v1.js';
import { restoreEg2WorkerImageBufferV1, type Eg2WorkerRequestV1, type Eg2WorkerResponseV1 } from './eg2-onnx-worker-protocol.js';

if (!parentPort) throw new Error('EG2_WORKER_PARENT_PORT_MISSING');
const port = parentPort;

async function handle(request: Eg2WorkerRequestV1): Promise<unknown> {
	switch (request.op) {
		case 'image': return embedEvidenceImageWithEmbeddingGemma2OnnxV1({
			...request.input,
			buffer: restoreEg2WorkerImageBufferV1(request.input.buffer),
		});
		case 'audio': return embedEvidenceAudioWithEmbeddingGemma2OnnxV1(request.input);
		case 'text': return embedEvidenceTextWithEmbeddingGemma2OnnxV1(request.input);
	}
}

port.on('message', (request: Eg2WorkerRequestV1) => {
	handle(request).then(
		(result) => port.postMessage({ id: request.id, ok: true, result } satisfies Eg2WorkerResponseV1),
		(error: unknown) => port.postMessage({
			id: request.id,
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		} satisfies Eg2WorkerResponseV1),
	);
});
