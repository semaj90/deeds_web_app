import type { EmbeddingGemma2TextKindV1 } from './embeddinggemma2-onnx-image-v1.js';

/** Request/response protocol between the main thread and the EmbeddingGemma 2 ONNX worker. */
export type Eg2WorkerRequestV1 =
	| { id: number; op: 'image'; input: { buffer: Buffer; modelDir?: string | null } }
	| { id: number; op: 'audio'; input: { pcm: Float32Array; sampleRate: number; modelDir?: string | null } }
	| { id: number; op: 'text'; input: { text: string; kind: EmbeddingGemma2TextKindV1; modelDir?: string | null } };

export type Eg2WorkerResponseV1 =
	| { id: number; ok: true; result: unknown }
	| { id: number; ok: false; error: string };

/** Node worker_threads structured-clones Buffer values into plain Uint8Arrays. */
export function restoreEg2WorkerImageBufferV1(value: unknown): Buffer {
	if (Buffer.isBuffer(value)) return value;
	if (value instanceof Uint8Array) {
		return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
	}
	throw new Error('EG2_WORKER_IMAGE_BUFFER_INVALID');
}
