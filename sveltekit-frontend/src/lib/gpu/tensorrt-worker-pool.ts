/**
 * TensorRT Worker Pool — Multi-threaded GPU Compute Bridge
 *
 * Routes GPU operations through N-API addon via Node.js worker threads:
 * - findBMUBatch (SOM clustering)
 * - computeAttentionBatch (attention scoring)
 * - encodeBatch (autoencoder compression)
 * - batchCosineSimilarity (vector similarity)
 * - kmeansWithCentroids (k-means clustering)
 * - pageRankGPU (graph PageRank)
 *
 * Worker pool: 4 threads on RTX 3060 Ti (1 per CUDA stream context)
 * Queue: bounded at 256 pending tasks (backpressure)
 * Affinity: pin workers to CPU cores for cache locality
 */

import { Worker } from 'worker_threads';
import type { TransferListItem } from 'worker_threads';
import { resolve } from 'path';

export interface GPUTask {
	taskId: string;
	operation: 'findBMU' | 'attention' | 'autoencoder' | 'cosine' | 'kmeans' | 'pagerank';
	embedding?: Float32Array;
	/** findBMU only — one embedding per candidate, transferred per-element. */
	embeddings?: Float32Array[];
	/**
	 * kmeans/pagerank only — a single flattened buffer (n*dim contiguous
	 * floats for kmeans, an n*n adjacency matrix for pagerank), NOT an array
	 * of embeddings. Kept as a distinct field from `embeddings` because the
	 * worker (tensorrt-worker.js) and the native addon both read it as one
	 * flat Float32Array, not per-element — reusing `embeddings` here was the
	 * source of a real TS2740 type-vs-runtime-shape mismatch.
	 */
	flatEmbeddings?: Float32Array;
	centroids?: Float32Array;
	queryEmbedding?: Float32Array;
	keys?: Float32Array;
	/** cosine only — a single flattened n*dim buffer, not an array of vectors. */
	corpus?: Float32Array;
	dim?: number;
	n?: number;
	k?: number;
	maxIters?: number;
	gridSize?: number;
	damping?: number;
	iters?: number;
	timeout?: number;
}

export interface GPUResult {
	taskId: string;
	error?: string;
	data?: Float32Array | Int32Array | number;
	duration?: number;
}

export type QueuedTask = {
	task: GPUTask;
	resolve: (result: GPUResult) => void;
	reject: (error: Error) => void;
};

export function removeQueuedTask(queue: QueuedTask[], taskId: string): boolean {
	const index = queue.findIndex((entry) => entry.task.taskId === taskId);
	if (index < 0) return false;
	queue.splice(index, 1);
	return true;
}

export function getNextAvailableWorkerIndex(
	workerCount: number,
	busyWorkers: ReadonlySet<number>,
	startIndex = 0,
): number | null {
	if (!Number.isInteger(workerCount) || workerCount <= 0) return null;
	const requestedStart = Number.isInteger(startIndex) ? startIndex : 0;
	const start = ((requestedStart % workerCount) + workerCount) % workerCount;
	for (let offset = 0; offset < workerCount; offset++) {
		const index = (start + offset) % workerCount;
		if (!busyWorkers.has(index)) return index;
	}
	return null;
}

class TensorRTWorkerPool {
	private workers: Worker[] = [];
	private busyWorkers = new Set<number>();
	private nextWorkerIndex = 0;
	private taskQueue: QueuedTask[] = [];
	private taskMap = new Map<string, { resolve: (r: GPUResult) => void; reject: (e: Error) => void }>();
	private poolSize: number;
	private maxQueueSize = 256;
	private workerScript: string;

	constructor(poolSize: number = 4) {
		this.poolSize = Math.min(poolSize, 4); // cap at 4 (CUDA stream contexts on RTX 3060 Ti)
		// Resolve worker script path relative to this file
		this.workerScript = resolve(__dirname, './tensorrt-worker.js');
		this.initializeWorkers();
	}

	private initializeWorkers() {
		for (let i = 0; i < this.poolSize; i++) {
			const worker = new Worker(this.workerScript, {
				workerData: { workerId: i, poolSize: this.poolSize }
			});

			worker.on('message', (result: GPUResult) => {
				this.handleWorkerResult(result, worker);
			});

			worker.on('error', (err) => {
				console.error(`[TensorRT Worker ${i}] Error:`, err);
				this.handleWorkerError(err, worker);
			});

			worker.on('exit', (code) => {
				if (code !== 0) {
					console.warn(`[TensorRT Worker ${i}] Exited with code ${code}`);
				}
			});

			this.workers.push(worker);
		}

		console.log(`[TensorRT Pool] Initialized ${this.poolSize} worker threads`);
	}

	private handleWorkerResult(result: GPUResult, worker: Worker) {
		const workerIndex = this.workers.indexOf(worker);
		if (workerIndex < 0) return;
		this.busyWorkers.delete(workerIndex);
		const handler = this.taskMap.get(result.taskId);
		if (handler) {
			this.taskMap.delete(result.taskId);
			if (result.error) {
				handler.reject(new Error(result.error));
			} else {
				handler.resolve(result);
			}
		}

		this.drainQueue();
	}

	private handleWorkerError(err: Error, failedWorker: Worker) {
		if (!this.workers.includes(failedWorker)) return;
		// Reject all pending tasks on worker death
		const entries = Array.from(this.taskMap.values());
		for (const { reject } of entries) {
			reject(err);
		}
		this.taskMap.clear();

		// Restart the pool so old in-flight work cannot report into replacement workers.
		const failedWorkers = this.workers;
		this.workers = [];
		this.busyWorkers.clear();
		void Promise.all(failedWorkers.map((worker) => worker.terminate()));
		this.initializeWorkers();
		this.drainQueue();
	}

	private drainQueue() {
		while (this.taskQueue.length > 0 && this.busyWorkers.size < this.poolSize) {
			const { task, resolve, reject } = this.taskQueue.shift()!;
			this.executeTask(task, resolve, reject);
		}
	}

	private executeTask(
		task: GPUTask,
		resolve: (r: GPUResult) => void,
		reject: (e: Error) => void
	) {
		const workerIdx = getNextAvailableWorkerIndex(
			this.poolSize,
			this.busyWorkers,
			this.nextWorkerIndex,
		);
		if (workerIdx === null) {
			reject(new Error('No available worker threads'));
			return;
		}
		this.busyWorkers.add(workerIdx);
		this.nextWorkerIndex = (workerIdx + 1) % this.poolSize;
		const worker = this.workers[workerIdx];

		if (!worker || worker.threadId === undefined) {
			this.busyWorkers.delete(workerIdx);
			reject(new Error('No available worker threads'));
			return;
		}

		this.taskMap.set(task.taskId, { resolve, reject });

		// Build transfer list for zero-copy
		const transfer: TransferListItem[] = [];
		const taskData = { ...task };

		if (task.embedding?.buffer) {
			transfer.push(task.embedding.buffer as ArrayBuffer);
		}
		if (task.embeddings) {
			for (const emb of task.embeddings) {
				if (emb.buffer) transfer.push(emb.buffer as ArrayBuffer);
			}
		}
		if (task.centroids?.buffer) {
			transfer.push(task.centroids.buffer as ArrayBuffer);
		}
		if (task.queryEmbedding?.buffer) {
			transfer.push(task.queryEmbedding.buffer as ArrayBuffer);
		}
		if (task.keys?.buffer) {
			transfer.push(task.keys.buffer as ArrayBuffer);
		}
		if (task.corpus?.buffer) {
			transfer.push(task.corpus.buffer as ArrayBuffer);
		}
		if (task.flatEmbeddings?.buffer) {
			transfer.push(task.flatEmbeddings.buffer as ArrayBuffer);
		}

		try {
			worker.postMessage(taskData, transfer);
		} catch (err) {
			this.taskMap.delete(task.taskId);
			this.busyWorkers.delete(workerIdx);
			reject(err as Error);
		}
	}

	async submit(task: GPUTask): Promise<GPUResult> {
		return new Promise((resolve, reject) => {
			if (!task.taskId.trim()) {
				reject(new Error('TensorRT taskId must not be empty'));
				return;
			}
			if (this.taskMap.has(task.taskId) || this.taskQueue.some((entry) => entry.task.taskId === task.taskId)) {
				reject(new Error(`Duplicate TensorRT taskId: ${task.taskId}`));
				return;
			}
			if (this.busyWorkers.size >= this.poolSize && this.taskQueue.length >= this.maxQueueSize) {
				reject(new Error(`TensorRT task queue full (${this.maxQueueSize} pending)`));
				return;
			}

			let settled = false;
			const timeout = Math.max(1, task.timeout ?? 30000);
			const timeoutId = setTimeout(() => {
				if (settled) return;
				settled = true;
				removeQueuedTask(this.taskQueue, task.taskId);
				this.taskMap.delete(task.taskId);
				reject(new Error(`TensorRT task timeout after ${timeout}ms`));
			}, timeout);

			const wrappedResolve = (result: GPUResult) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeoutId);
				resolve(result);
			};
			const wrappedReject = (error: Error) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeoutId);
				reject(error);
			};

			if (this.busyWorkers.size >= this.poolSize) {
				this.taskQueue.push({ task, resolve: wrappedResolve, reject: wrappedReject });
			} else {
				this.executeTask(task, wrappedResolve, wrappedReject);
			}
		});
	}

	async terminate() {
		await Promise.all(this.workers.map((w) => w.terminate()));
		this.workers = [];
		this.busyWorkers.clear();
		this.taskMap.clear();
		this.taskQueue = [];
		console.log('[TensorRT Pool] Terminated all worker threads');
	}

	getStats() {
		return {
			poolSize: this.poolSize,
			activeTasks: this.busyWorkers.size,
			queuedTasks: this.taskQueue.length,
			workers: this.workers.length,
			workerStates: this.workers.map((w, i) => ({
				id: i,
				threadId: w.threadId,
				alive: !w.threadId ? false : true
			}))
		};
	}
}

// Singleton pool (lazy-initialized)
let globalPool: TensorRTWorkerPool | null = null;

export function getWorkerPool(): TensorRTWorkerPool {
	if (!globalPool) {
		globalPool = new TensorRTWorkerPool(4);
	}
	return globalPool;
}

export async function terminateWorkerPool() {
	if (globalPool) {
		await globalPool.terminate();
		globalPool = null;
	}
}

/**
 * High-level GPU operation wrappers
 */

export async function gpuFindBMUBatch(
	embeddings: Float32Array[],
	centroids: Float32Array,
	gridSize: number = 20
): Promise<{ cluster: number; distance: number }[]> {
	const pool = getWorkerPool();
	const result = await pool.submit({
		taskId: `bmu-${Date.now()}-${Math.random()}`,
		operation: 'findBMU',
		embeddings,
		centroids,
		gridSize
	});

	if (result.error || !result.data) throw new Error(result.error || 'BMU computation failed');

	// Parse result as array of [cluster, distance] pairs
	const arr = result.data as Int32Array;
	const output = [];
	for (let i = 0; i < arr.length; i += 2) {
		output.push({ cluster: arr[i], distance: arr[i + 1] });
	}
	return output;
}

export async function gpuComputeAttentionBatch(
	queryEmbedding: Float32Array,
	keyEmbeddings: Float32Array[],
	dim: number = 768
): Promise<Float32Array> {
	const pool = getWorkerPool();

	// Concatenate all key embeddings into single buffer
	const keysBuffer = new Float32Array(keyEmbeddings.length * dim);
	for (let i = 0; i < keyEmbeddings.length; i++) {
		keysBuffer.set(keyEmbeddings[i], i * dim);
	}

	const result = await pool.submit({
		taskId: `attn-${Date.now()}-${Math.random()}`,
		operation: 'attention',
		queryEmbedding,
		keys: keysBuffer,
		dim,
		n: keyEmbeddings.length
	});

	if (result.error || !result.data) throw new Error(result.error || 'Attention computation failed');
	return result.data as Float32Array;
}

export async function gpuBatchCosineSimilarity(
	query: Float32Array,
	corpus: Float32Array[],
	dim: number = 768
): Promise<Float32Array> {
	const pool = getWorkerPool();

	// Concatenate corpus
	const corpusBuffer = new Float32Array(corpus.length * dim);
	for (let i = 0; i < corpus.length; i++) {
		corpusBuffer.set(corpus[i], i * dim);
	}

	const result = await pool.submit({
		taskId: `cosine-${Date.now()}-${Math.random()}`,
		operation: 'cosine',
		queryEmbedding: query,
		corpus: corpusBuffer,
		dim,
		n: corpus.length
	});

	if (result.error || !result.data) throw new Error(result.error || 'Cosine similarity failed');
	return result.data as Float32Array;
}

export async function gpuKmeansWithCentroids(
	embeddings: Float32Array,
	n: number,
	dim: number,
	k: number,
	maxIters: number = 10
): Promise<{ assignments: Int32Array; centroids: Float32Array }> {
	const pool = getWorkerPool();

	const result = await pool.submit({
		taskId: `kmeans-${Date.now()}-${Math.random()}`,
		operation: 'kmeans',
		flatEmbeddings: embeddings,
		n,
		dim,
		k,
		maxIters
	});

	if (result.error || !result.data) throw new Error(result.error || 'K-means failed');

	// Parse: first n elements are assignments, rest are centroids
	const data = result.data as Int32Array;
	const assignments = new Int32Array(n);
	const centroids = new Float32Array((k * dim) || 0);

	for (let i = 0; i < n; i++) {
		assignments[i] = data[i];
	}
	for (let i = 0; i < k * dim && n + i < data.length; i++) {
		centroids[i] = data[n + i] / 1000000; // undo scaling from worker
	}

	return { assignments, centroids };
}

export async function gpuPageRank(
	adjacencyMatrix: Float32Array,
	n: number,
	damping: number = 0.85,
	iters: number = 20
): Promise<Float32Array> {
	const pool = getWorkerPool();

	const result = await pool.submit({
		taskId: `pagerank-${Date.now()}-${Math.random()}`,
		operation: 'pagerank',
		flatEmbeddings: adjacencyMatrix,
		n,
		damping,
		iters
	});

	if (result.error || !result.data) throw new Error(result.error || 'PageRank computation failed');
	const prData = result.data;
	if (Object.prototype.toString.call(prData) === '[object Float32Array]') {
		return Float32Array.from(prData as ArrayLike<number>);
	}
	if (Array.isArray(prData)) {
		return Float32Array.from(prData, Number);
	}
	// Convert from Int32Array if needed (scaled values)
	const pr = new Float32Array((prData as any).length);
	for (let i = 0; i < pr.length; i++) {
		pr[i] = (prData as any)[i] / 1000000;
	}
	return pr;
}
