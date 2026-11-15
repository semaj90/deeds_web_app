import { existsSync } from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type {
	EmbeddingGemma2AudioVectorV1,
	EmbeddingGemma2ImageVectorV1,
	EmbeddingGemma2TextKindV1,
	EmbeddingGemma2TextVectorV1,
} from './embeddinggemma2-onnx-image-v1.js';
import type { Eg2WorkerRequestV1, Eg2WorkerResponseV1 } from './eg2-onnx-worker-protocol.js';

/** Bundle produced by `npm run build:workers`; relative to the app root (process.cwd()). */
export const EG2_ONNX_WORKER_BUNDLE_RELATIVE_PATH_V1 = path.join('build', 'workers', 'eg2-onnx-worker.mjs');

type Pending = { resolve(value: unknown): void; reject(error: Error): void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
// ONNX sessions are shared inside the worker; one request at a time keeps memory and CPU bounded.
let queue: Promise<unknown> = Promise.resolve();

function resetWorker(error: Error): void {
	const current = worker;
	worker = null;
	for (const entry of pending.values()) entry.reject(error);
	pending.clear();
	void current?.terminate();
}

function bundlePath(): string {
	const resolved = path.resolve(process.cwd(), EG2_ONNX_WORKER_BUNDLE_RELATIVE_PATH_V1);
	if (!existsSync(resolved)) throw new Error('EG2_WORKER_BUNDLE_MISSING: run npm run build:workers');
	return resolved;
}

function ensureWorker(): Worker {
	if (worker) return worker;
	const started = new Worker(bundlePath());
	started.on('message', (response: Eg2WorkerResponseV1) => {
		const entry = pending.get(response.id);
		if (!entry) return;
		pending.delete(response.id);
		if (response.ok === false) entry.reject(new Error((response as { error: string }).error));
		else entry.resolve((response as { result: unknown }).result);
	});
	started.on('error', (error) => resetWorker(error instanceof Error ? error : new Error(String(error))));
	started.on('exit', (code) => {
		if (worker === started) resetWorker(new Error(`EG2_WORKER_EXITED: code ${code}`));
	});
	worker = started;
	return started;
}

function call<T>(build: (id: number) => Eg2WorkerRequestV1): Promise<T> {
	const run = queue.then(() => new Promise<T>((resolve, reject) => {
		const id = nextId++;
		pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
		try {
			ensureWorker().postMessage(build(id));
		} catch (error) {
			pending.delete(id);
			reject(error instanceof Error ? error : new Error(String(error)));
		}
	}));
	queue = run.catch(() => undefined);
	return run;
}

export function embedEvidenceImageViaEg2WorkerV1(input: {
	buffer: Buffer;
	modelDir?: string | null;
}): Promise<EmbeddingGemma2ImageVectorV1> {
	return call((id) => ({ id, op: 'image', input }));
}

export function embedEvidenceAudioViaEg2WorkerV1(input: {
	pcm: Float32Array;
	sampleRate: number;
	modelDir?: string | null;
}): Promise<EmbeddingGemma2AudioVectorV1> {
	return call((id) => ({ id, op: 'audio', input }));
}

export function embedEvidenceTextViaEg2WorkerV1(input: {
	text: string;
	kind: EmbeddingGemma2TextKindV1;
	modelDir?: string | null;
}): Promise<EmbeddingGemma2TextVectorV1> {
	return call((id) => ({ id, op: 'text', input }));
}

/** Test and shutdown hook: terminates the worker and rejects anything still in flight. */
export async function shutdownEg2OnnxWorkerV1(): Promise<void> {
	const current = worker;
	resetWorker(new Error('EG2_WORKER_SHUTDOWN'));
	await current?.terminate();
}
