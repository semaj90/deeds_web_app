/**
 * Generic CPU Worker Pool for offloading heavy computation.
 *
 * Prevents Node.js event loop blocking by routing CPU-bound tasks
 * (clustering, forensics, regex, embeddings) to worker_threads.
 *
 * Sticky routing:
 *   run(type, payload, { routingKey: 'repo:deeds/cluster:7' })
 *   → deterministic worker selection via FNV-1a hash
 *   → same routingKey always lands on the same worker (warm caches, warm JS JIT)
 *   → falls back to idle-first → queue if sticky worker is busy
 *
 * Usage:
 *   const pool = getComputePool();
 *   const result = await pool.run('kmeans', { embeddings, k: 15 });
 *   const result = await pool.run('som', payload, { routingKey: `repo:${repo}` });
 */

import { Worker } from 'worker_threads';
import path from 'path';
import os from 'os';
import { traceWorker } from '$lib/server/observability/langfuse.js';

export type TaskType =
  | 'kmeans' | 'som' | 'forensics' | 'silhouette' | 'similarity'
  | 'chunk' | 'hash' | 'metadata' | 'qdrant_payload' | 'langextract.extract';

export interface RunOptions {
	/** Soft-affinity key: same key → same worker (warm JIT, hot caches).
	 *  Format: 'repo:<name>' | 'cluster:<id>' | 'repo:<name>/cluster:<id>' | any string.
	 *  Collision is harmless — falls back to idle-first dispatch. */
	routingKey?: string;
	timeoutMs?: number;
}

export const DEFAULT_MAX_QUEUED_COMPUTE_TASKS = 64;
export const DEFAULT_MAX_QUEUED_COMPUTE_BYTES = 64 * 1024 * 1024;
export const MAX_SIMILARITY_CANDIDATES_PER_BATCH = 500;
export const MAX_SIMILARITY_BATCH_BYTES = 64 * 1024 * 1024;
export const MAX_GPU_SIMILARITY_VALUES_PER_BATCH = 250_000;

export function computeSimilarityChunkSize(candidateCount: number, dimensions: number): number {
	if (!Number.isSafeInteger(candidateCount) || candidateCount < 0
		|| !Number.isSafeInteger(dimensions) || dimensions <= 0) {
		throw new Error('SIMILARITY_SHAPE_INVALID');
	}
	if (candidateCount === 0) return 0;
	const queryBytes = dimensions * Float32Array.BYTES_PER_ELEMENT;
	const bytesPerCandidate = queryBytes + Float32Array.BYTES_PER_ELEMENT;
	const maxByBytes = Math.floor((MAX_SIMILARITY_BATCH_BYTES - queryBytes) / bytesPerCandidate);
	if (maxByBytes < 1) throw new Error('SIMILARITY_ROW_EXCEEDS_BATCH_BYTE_LIMIT');
	return Math.min(candidateCount, MAX_SIMILARITY_CANDIDATES_PER_BATCH, maxByBytes);
}

export function computeGpuSimilarityChunkSize(candidateCount: number, dimensions: number): number {
	const boundedSize = computeSimilarityChunkSize(candidateCount, dimensions);
	if (boundedSize === 0) return 0;
	const maxByJsArrayValues = Math.floor(MAX_GPU_SIMILARITY_VALUES_PER_BATCH / dimensions) - 1;
	if (maxByJsArrayValues < 1) throw new Error('SIMILARITY_GPU_ROW_EXCEEDS_BATCH_VALUE_LIMIT');
	return Math.min(boundedSize, maxByJsArrayValues);
}

export function estimateComputePayloadBytes(value: unknown, maxBytes = DEFAULT_MAX_QUEUED_COMPUTE_BYTES): number {
	const seen = new WeakSet<object>();
	let total = 0;
	let nodes = 0;
	let exceeded = false;
	const add = (bytes: number): void => {
		total += bytes;
		if (total > maxBytes) exceeded = true;
	};
	const visit = (item: unknown): void => {
		if (exceeded) return;
		nodes += 1;
		if (nodes > 250_000) {
			exceeded = true;
			return;
		}
		if (item === null || item === undefined || typeof item === 'boolean' || typeof item === 'number') {
			add(8);
			return;
		}
		if (typeof item === 'string') {
			add(8 + Buffer.byteLength(item, 'utf8'));
			return;
		}
		if (typeof item === 'bigint') {
			add(16);
			return;
		}
		if (typeof item !== 'object') {
			exceeded = true;
			return;
		}
		if (seen.has(item)) return;
		seen.add(item);
		if (item instanceof ArrayBuffer) {
			add(16 + item.byteLength);
			return;
		}
		if (typeof SharedArrayBuffer !== 'undefined' && item instanceof SharedArrayBuffer) {
			add(16 + item.byteLength);
			return;
		}
		if (ArrayBuffer.isView(item)) {
			add(16 + item.byteLength);
			return;
		}
		if (item instanceof Map) {
			add(32);
			for (const [key, entry] of item) {
				visit(key);
				visit(entry);
				if (exceeded) return;
			}
			return;
		}
		if (item instanceof Set || Array.isArray(item)) {
			add(24);
			for (const entry of item) {
				visit(entry);
				if (exceeded) return;
			}
			return;
		}
		try {
			const entries = Object.entries(item);
			add(32);
			for (const [key, entry] of entries) {
				add(Buffer.byteLength(key, 'utf8') + 8);
				visit(entry);
				if (exceeded) return;
			}
		} catch {
			exceeded = true;
		}
	};
	if (!Number.isFinite(maxBytes) || maxBytes < 0) return Number.POSITIVE_INFINITY;
	visit(value);
	return exceeded ? Number.POSITIVE_INFINITY : total;
}

export function canQueueComputeTask(queueSize: number, maxQueuedTasks: number): boolean {
	return Number.isInteger(queueSize) && queueSize >= 0
		&& Number.isInteger(maxQueuedTasks) && maxQueuedTasks >= 0
		&& queueSize < maxQueuedTasks;
}

interface PendingTask {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

interface WorkerEntry {
	worker: Worker;
	busy: boolean;
}

interface QueuedTask {
	taskId: number;
	type: TaskType;
	payload: unknown;
	deadlineAt: number;
	payloadBytes: number;
	task: PendingTask;
}

/**
 * Default worker-pool size: bounded at 4 regardless of host CPU count, and
 * reduced to 1 in cluster-worker mode (to avoid N-cluster-workers *
 * M-threads-per-worker thread explosion). Extracted as a pure function so
 * this bound is independently testable without spawning real worker_threads
 * (see compute-pool.spec.ts).
 */
export function computeDefaultComputePoolSize(cpuCount: number, isClusterWorker: boolean): number {
	if (isClusterWorker) return 1;
	return Math.max(1, Math.min(cpuCount - 2, 4));
}

// ── FNV-1a 32-bit for sticky routing ─────────────────────────────────────────
// Fast, deterministic, no crypto import. Maps routingKey → worker index.
// Same key on every call: no locking, no shared state needed.
function fnv1aWorkerIndex(key: string, numWorkers: number): number {
	let hash = 0x811c9dc5 >>> 0;
	for (let i = 0; i < key.length; i++) {
		hash ^= key.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash % numWorkers;
}

export class ComputePool {
	private workers: WorkerEntry[] = [];
	private taskQueue: QueuedTask[] = [];
	private queuedPayloadBytes = 0;
	private taskIdCounter = 0;
	private pendingTasks = new Map<number, PendingTask>();
	private disposed = false;

	constructor(
		private poolSize?: number,
		private maxQueuedTasks = DEFAULT_MAX_QUEUED_COMPUTE_TASKS,
		private maxQueuedBytes = DEFAULT_MAX_QUEUED_COMPUTE_BYTES
	) {
		if (!Number.isInteger(maxQueuedTasks) || maxQueuedTasks < 0
			|| !Number.isInteger(maxQueuedBytes) || maxQueuedBytes < 0) {
			throw new Error('ComputePool queue limits must be nonnegative integers');
		}
		// In cluster mode, reduce pool size to avoid thread explosion (N workers * M threads)
		const isClusterWorker = process.env.CLUSTER_WORKERS && parseInt(process.env.CLUSTER_WORKERS) > 1;
		this.poolSize = poolSize ?? computeDefaultComputePoolSize(os.cpus().length, Boolean(isClusterWorker));
		this.initWorkers();
	}

	private initWorkers(): void {
		// Worker script path — relative to project root in both dev and prod
		const workerPath = path.join(
			process.cwd(),
			'src/lib/workers/compute-worker.mjs'
		);

		for (let i = 0; i < this.poolSize!; i++) {
			try {
				const worker = new Worker(workerPath);
				const entry: WorkerEntry = { worker, busy: false };

				worker.on('message', (msg: { taskId: number; result?: unknown; error?: string }) => {
					const pending = this.pendingTasks.get(msg.taskId);
					if (!pending) return;

					clearTimeout(pending.timer);
					this.pendingTasks.delete(msg.taskId);
					entry.busy = false;

					if (msg.error) {
						pending.reject(new Error(msg.error));
					} else {
						pending.resolve(msg.result);
					}

					// Process next queued task
					this.drainQueue(entry);
				});

				worker.on('error', (err) => {
					console.error(`[ComputePool] Worker ${i} error:`, err.message);
					entry.busy = false;
					this.drainQueue(entry);
				});

				worker.on('exit', (code) => {
					if (code !== 0 && !this.disposed) {
						console.warn(`[ComputePool] Worker ${i} exited with code ${code}, restarting...`);
						const idx = this.workers.indexOf(entry);
						if (idx >= 0) {
							this.workers.splice(idx, 1);
							// Restart after brief delay
							setTimeout(() => {
								if (!this.disposed) this.initWorkers();
							}, 1000);
						}
					}
				});

				this.workers.push(entry);
			} catch (err) {
				console.warn(`[ComputePool] Failed to create worker ${i}:`, (err as Error).message);
			}
		}

		if (this.workers.length > 0) {
			console.info(`[ComputePool] Initialized ${this.workers.length} worker threads`);
		}
	}

	/**
	 * Run a compute task on a worker thread.
	 *
	 * K-means tasks use GPU fast-path when CUDA is available (5-10x faster).
	 * Falls back to worker thread if GPU unavailable or on error.
	 *
	 * Sticky routing:
	 *   If options.routingKey is provided, the task is assigned to
	 *   workers[fnv1a(routingKey) % N].  If that worker is busy, the algorithm
	 *   ring-searches clockwise for the next idle worker before queuing.
	 *   This keeps hot data (parsed files, JIT-compiled functions, cached embeddings)
	 *   on the same thread across repeated calls for the same repo/cluster.
	 */
	async run<T = unknown>(
		type: TaskType,
		payload: unknown,
		options: RunOptions | number = {}
	): Promise<T> {
		if (this.disposed) throw new Error('ComputePool is disposed');

		// Back-compat: run(type, payload, timeoutMs) → run(type, payload, { timeoutMs })
		const opts: RunOptions = typeof options === 'number' ? { timeoutMs: options } : options;
		const timeoutMs = opts.timeoutMs ?? 30_000;

		// GPU fast-path for K-means: route to LibTorch CUDA if available
		if (type === 'kmeans') {
			try {
				const gpuResult = await this.tryGpuKmeans(payload);
				if (gpuResult) return gpuResult as T;
			} catch {
				// Fall through to worker thread
			}
		}

		// SharedArrayBuffer similarity tasks go through runBatchSimilarity() directly
		// (they already have the GPU check + SAB construction there — skip double-dispatch)
		if (type === 'similarity') {
			// Allow to proceed to worker dispatch below — SAB is already set up by caller
		}

		return traceWorker<T>(type, {
			timeoutMs,
			poolSize: this.poolSize,
			queueSize: this.taskQueue.length,
			routingKey: opts.routingKey,
		}, () => {
			const taskId = this.taskIdCounter++;

			return new Promise<T>((resolve, reject) => {
				const deadlineAt = Date.now() + timeoutMs;
				const timer = setTimeout(() => {
					this.pendingTasks.delete(taskId);
					const queuedIndex = this.taskQueue.findIndex((queued) => queued.taskId === taskId);
					if (queuedIndex >= 0) {
						const [queued] = this.taskQueue.splice(queuedIndex, 1);
						this.queuedPayloadBytes -= queued.payloadBytes;
					}
					reject(new Error(`[ComputePool] Task ${type} timed out after ${timeoutMs}ms`));
				}, timeoutMs);

				const pending: PendingTask = {
					resolve: resolve as (v: unknown) => void,
					reject,
					timer,
				};

				if (this.workers.length === 0) {
					clearTimeout(timer);
					reject(new Error('[ComputePool] No workers available'));
					return;
				}

				// ── Sticky routing ─────────────────────────────────────────────────
				// If routingKey provided: prefer the hashed worker, ring-search if busy.
				// If no routingKey: use classic idle-first dispatch.
				const preferred = opts.routingKey
					? fnv1aWorkerIndex(opts.routingKey, this.workers.length)
					: -1;

				let target: WorkerEntry | null = null;

				if (preferred >= 0) {
					// Ring-search starting at hashed index
					for (let i = 0; i < this.workers.length; i++) {
						const w = this.workers[(preferred + i) % this.workers.length];
						if (!w.busy) { target = w; break; }
					}
				} else {
					target = this.workers.find((w) => !w.busy) ?? null;
				}

				if (target) {
					this.dispatch(target, taskId, type, payload, pending);
				} else {
					const payloadBytes = estimateComputePayloadBytes(payload, this.maxQueuedBytes);
					if (!canQueueComputeTask(this.taskQueue.length, this.maxQueuedTasks)
						|| !Number.isFinite(payloadBytes)
						|| this.queuedPayloadBytes + payloadBytes > this.maxQueuedBytes) {
						clearTimeout(timer);
						reject(new Error('[ComputePool] Queue capacity exceeded'));
						return;
					}
					this.taskQueue.push({ taskId, type, payload, deadlineAt, payloadBytes, task: pending });
					this.queuedPayloadBytes += payloadBytes;
				}
			});
		});
	}

	private dispatch(
		entry: WorkerEntry,
		taskId: number,
		type: TaskType,
		payload: unknown,
		pending: PendingTask
	): void {
		entry.busy = true;
		this.pendingTasks.set(taskId, pending);
		entry.worker.postMessage({ taskId, type, payload });
	}

	private drainQueue(entry: WorkerEntry): void {
		if (entry.busy) return;
		while (this.taskQueue.length > 0) {
			const next = this.taskQueue.shift()!;
			this.queuedPayloadBytes -= next.payloadBytes;
			if (next.deadlineAt <= Date.now()) {
				clearTimeout(next.task.timer);
				next.task.reject(new Error(`[ComputePool] Task ${next.type} timed out before dispatch`));
				continue;
			}
			this.dispatch(entry, next.taskId, next.type, next.payload, next.task);
			return;
		}
	}

	/** Number of idle workers */
	get idleCount(): number {
		return this.workers.filter((w) => !w.busy).length;
	}

	/** Number of queued tasks */
	get queueSize(): number {
		return this.taskQueue.length;
	}

	/**
	 * Run batch cosine similarity — GPU fast-path via LibTorch, falls back to
	 * worker thread with SharedArrayBuffer zero-copy transfer (L1-L3 optimized).
	 *
	 * SharedArrayBuffer protocol (zero-copy IPC — avoids structured-clone overhead):
	 *   - query vector and corpus matrix are written into shared memory regions
	 *   - worker reads them directly without serialization
	 *   - score results are written back into a third shared region
	 *   - main thread reads scores without any copying
	 *
	 * For n=1000 at dim=768: ~3MB corpus, <1ms shared write, ~20ms worker compute.
	 * GPU path is ~100× faster for n>100; worker thread is ~2× faster than main thread
	 * (avoids blocking event loop + separate L1/L2 cache for the worker).
	 *
	 * @param query  - Query vector (Float32Array, 768-dim)
	 * @param corpus - Candidate vectors (Float32Array, n × dim, row-major)
	 * @param n      - Number of candidates
	 * @param dim    - Vector dimension (default 768)
	 */
	async runBatchSimilarity(
		query: Float32Array,
		corpus: Float32Array,
		n: number,
		dim = 768
	): Promise<{ scores: number[]; source: 'gpu' | 'cpu-worker' }> {
		const chunkSize = computeSimilarityChunkSize(n, dim);
		if (query.length < dim || corpus.length < n * dim) throw new Error('SIMILARITY_INPUT_LENGTH_MISMATCH');
		if (n === 0) return { scores: [], source: 'cpu-worker' };

		// Keep each executor request bounded; GPU conversion to nested JS arrays is
		// also limited to one chunk rather than the entire corpus.
		try {
			const { batchCosineSimilarity, isCudaAvailable } = await import('$lib/server/gpu/libtorch-bridge.js');
			if (isCudaAvailable()) {
				const queryArr = Array.from(query.subarray(0, dim));
				const scores: number[] = [];
				const gpuChunkSize = computeGpuSimilarityChunkSize(n, dim);
				for (let offset = 0; offset < n; offset += gpuChunkSize) {
					const count = Math.min(gpuChunkSize, n - offset);
					const corpusArr: number[][] = [];
					for (let row = offset; row < offset + count; row++) {
						corpusArr.push(Array.from(corpus.subarray(row * dim, (row + 1) * dim)));
					}
					const result = await batchCosineSimilarity(queryArr, corpusArr);
					if (result.scores.length !== count) throw new Error('SIMILARITY_GPU_RESULT_LENGTH_MISMATCH');
					scores.push(...result.scores);
				}
				return { scores, source: 'gpu' };
			}
		} catch {
			// Fall through to worker thread
		}

		// Worker thread fallback with SharedArrayBuffer zero-copy
		// SharedArrayBuffer is always available in Node.js worker_threads context
		// (no COOP/COEP headers needed — that restriction is browser-only)
		const sharedQuery = new SharedArrayBuffer(dim * Float32Array.BYTES_PER_ELEMENT);
		new Float32Array(sharedQuery).set(query.subarray(0, dim));
		const scores: number[] = [];
		for (let offset = 0; offset < n; offset += chunkSize) {
			const count = Math.min(chunkSize, n - offset);
			const sharedCorpus = new SharedArrayBuffer(count * dim * Float32Array.BYTES_PER_ELEMENT);
			const sharedScores = new SharedArrayBuffer(count * Float32Array.BYTES_PER_ELEMENT);
			new Float32Array(sharedCorpus).set(corpus.subarray(offset * dim, (offset + count) * dim));
			await this.run<{ n: number; dim: number; shared: boolean }>(
				'similarity',
				{ sharedQuery, sharedCorpus, sharedScores, n: count, dim },
				{ timeoutMs: 60_000 }
			);
			scores.push(...new Float32Array(sharedScores));
		}
		return { scores, source: 'cpu-worker' };
	}

	/**
	 * GPU fast-path for K-means via LibTorch CUDA.
	 * Returns null if CUDA unavailable — caller falls back to worker thread.
	 */
	private async tryGpuKmeans(payload: unknown): Promise<unknown | null> {
		const { clusterEmbeddings, isCudaAvailable } = await import('$lib/server/gpu/libtorch-bridge.js');
		if (!isCudaAvailable()) return null;

		const { embeddings, k = 15 } = payload as {
			embeddings: number[][];
			k?: number;
		};

		const gpuResult = await clusterEmbeddings(embeddings, k);
		console.log(`[ComputePool] K-means routed to GPU (${embeddings.length} points, k=${k})`);

		// Map libtorch result to worker ClusterResult shape
		return {
			clusters: gpuResult.assignments,
			centroids: gpuResult.centroids,
			silhouetteScore: 0, // Not computed on GPU — use pool.run('silhouette') if needed
			iterations: 1,
			inertia: 0,
		};
	}

	/** Shutdown all workers */
	async dispose(): Promise<void> {
		this.disposed = true;
		for (const queued of this.taskQueue) {
			clearTimeout(queued.task.timer);
			queued.task.reject(new Error('ComputePool disposed'));
		}
		this.taskQueue = [];
		this.queuedPayloadBytes = 0;
		// Reject all pending
		for (const [, pending] of this.pendingTasks) {
			clearTimeout(pending.timer);
			pending.reject(new Error('ComputePool disposed'));
		}
		this.pendingTasks.clear();

		await Promise.allSettled(
			this.workers.map((w) => w.worker.terminate())
		);
		this.workers = [];
	}
}

// Singleton
let pool: ComputePool | null = null;

export function getComputePool(): ComputePool {
	if (!pool) {
		pool = new ComputePool();
	}
	return pool;
}
