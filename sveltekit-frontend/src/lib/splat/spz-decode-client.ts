/**
 * Main-thread client for the SPZ decode worker.
 *
 * - decode() TRANSFERS the input buffer. The caller's ArrayBuffer is detached afterwards. Copy first if a cache or
 *   another consumer still needs the bytes.
 * - Result payload typed arrays are owned by the caller. Call dispose() on the payload to drop references.
 * - Worker crash: every pending decode rejects with SPZ_WORKER_FAILED, the worker is terminated, and the next
 *   decode() starts a fresh one.
 */
import { SpzError } from './spz-loader.js';
import type { SpzDecodedPayload, SpzWorkerRequest, SpzWorkerResponse } from './spz-decode-core.js';

/** Minimal Worker surface used here. Lets tests supply a fake. */
export interface SpzWorkerLike {
	postMessage(msg: SpzWorkerRequest, transfer?: ArrayBuffer[]): void;
	terminate(): void;
	onmessage: ((ev: MessageEvent<SpzWorkerResponse>) => void) | null;
	onerror: ((ev: ErrorEvent) => void) | null;
}

export interface SpzDecodeJob {
	id: number;
	result: Promise<SpzDecodedPayload>;
}

export class SpzDecodeClient {
	private worker: SpzWorkerLike | null = null;
	private nextId = 1;
	private pending = new Map<number, { resolve: (p: SpzDecodedPayload) => void; reject: (e: Error) => void }>();

	constructor(private readonly createWorker: () => SpzWorkerLike) {}

	decode(bytes: ArrayBuffer, maxPoints?: number): SpzDecodeJob {
		const id = this.nextId++;
		const worker = this.ensureWorker();
		let rejectResult!: (error: Error) => void;
		const result = new Promise<SpzDecodedPayload>((resolve, reject) => {
			rejectResult = reject;
			this.pending.set(id, { resolve, reject });
		});
		const request: SpzWorkerRequest = { type: 'decode', id, bytes, ...(maxPoints === undefined ? {} : { maxPoints }) };
		try {
			worker.postMessage(request, [bytes]);
		} catch (cause) {
			this.pending.delete(id);
			const message = cause instanceof Error ? cause.message : String(cause);
			rejectResult(new SpzError('SPZ_WORKER_POST_FAILED', message));
		}
		return { id, result };
	}

	cancel(id: number): void {
		if (!this.worker || !this.pending.has(id)) return;
		try {
			this.worker.postMessage({ type: 'cancel', id });
		} catch (cause) {
			const entry = this.pending.get(id);
			this.pending.delete(id);
			const message = cause instanceof Error ? cause.message : String(cause);
			entry?.reject(new SpzError('SPZ_WORKER_POST_FAILED', message));
		}
	}

	/** Terminate the worker and reject anything still pending. */
	dispose(): void {
		this.failAll('SPZ_CLIENT_DISPOSED', 'client disposed');
		this.worker?.terminate();
		this.worker = null;
	}

	private ensureWorker(): SpzWorkerLike {
		if (this.worker) return this.worker;
		const w = this.createWorker();
		w.onmessage = (ev) => this.onMessage(ev.data);
		w.onerror = (ev) => {
			this.failAll('SPZ_WORKER_FAILED', ev.message || 'worker error');
			w.terminate();
			if (this.worker === w) this.worker = null;
		};
		this.worker = w;
		return w;
	}

	private onMessage(msg: SpzWorkerResponse): void {
		const entry = this.pending.get(msg.id);
		if (!entry) return;
		this.pending.delete(msg.id);
		if (msg.type === 'result') entry.resolve(msg.payload);
		else entry.reject(new SpzError(msg.code, msg.message));
	}

	private failAll(code: string, message: string): void {
		for (const [id, entry] of this.pending) {
			this.pending.delete(id);
			entry.reject(new SpzError(code, message));
		}
	}
}

/** Vite-managed module worker. Call only from a browser/client lifecycle. */
export function createSpzDecodeClient(): SpzDecodeClient {
	return new SpzDecodeClient(() => new Worker(new URL('../workers/spz-decode.worker.ts', import.meta.url), { type: 'module' }));
}
