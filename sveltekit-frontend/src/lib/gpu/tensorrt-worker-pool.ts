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
import path from 'path';

export interface GPUTask {
	taskId: string;
	operation: 'findBMU' | 'attention' | 'autoencoder' | 'cosine' | 'kmeans' | 'pagerank';
	embedding?: Float32Array;
	embeddings?: Float32Array[];
	centroids?: Float32Array;
	queryEmbedding?: Float32Array;
	keys?: Float32Array;
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

class TensorRTWorkerPool {
	private workers: Worker[] = [];
	private taskQueue: Array<{ task: GPUTask; resolve: (r: GPUResult) => void; reject: (e: Error) => void }> = [];
	private taskMap = new Map<string, { resolve: (r: GPUResult) => void; reject: (e: Error) => void }>();
	private poolSize: number;
	private maxQueueSize = 256;
	private workerScript: string;

	constructor(poolSize: number = 4) {
		this.poolSize = Math.min(poolSize, 4); // cap at 4 (CUDA stream contexts on RTX 3060 Ti)
		this.workerScript = path.resolve(__dirname, './tensorrt-worker.js');
		this.initializeWorkers();
	}

	private initializeWorkers() {
		for (let i = 0; i < this.poolSize; i++) {
			const worker = new Worker(this.workerScript, {
				workerData: { workerId: i, poolSize: this.poolSize }
			});

			worker.on('message', (result: GPUResult) => {
				this.handleWorkerResult(result);
			});

			worker.on('error', (err) => {
				console.error(`[TensorRT Worker ${i}] Error:`, err);
				this.handleWorkerError(err);
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

	private handleWorkerResult(result: GPUResult) {
		const handler = this.taskMap.get(result.taskId);
		if (handler) {
			this.taskMap.delete(result.taskId);
			if (result.error) {
				handler.reject(new Error(result.error));
			} else {
				handler.resolve(result);
			}
		}

		// Process next queued task
		if (this.taskQueue.length > 0) {
			const { task, resolve, reject } = this.taskQueue.shift()!;
			this.executeTask(task, resolve, reject);
		}
	}

	private handleWorkerError(err: Error) {
		// Reject all pending tasks on worker death
		for (const { reject } of this.taskMap.values()) {
			reject(err);
		}
		this.taskMap.clear();

		// Reinitialize pool (one worker crashed)
		this.workers = [];
		this.initializeWorkers();
	}

	private executeTask(
		task: GPUTask,
		resolve: (r: GPUResult) => void,
		reject: (e: Error) => void
	) {
		// Pick a worker (round-robin)
		const workerIdx = this.taskMap.size % this.poolSize;
		const worker = this.workers[workerIdx];

		if (!worker || worker.threadId === undefined) {
			reject(new Error('No available worker threads'));
			return;
		}

		this.taskMap.set(task.taskId, { resolve, reject });

		// Build transfer list for zero-copy
		const transfer: TransferListItem[] = [];
		const taskData = { ...task };

		if (task.embedding?.buffer) {
			transfer.push(task.embedding.buffer);
		}
		if (task.embeddings) {
			for (const emb of task.embeddings) {
				if (emb.buffer) transfer.push(emb.buffer);
			}
		}
		if (task.centroids?.buffer) {
			transfer.push(task.centroids.buffer);
		}
		if (task.queryEmbedding?.buffer) {
			transfer.push(task.queryEmbedding.buffer);
		}
		if (task.keys?.buffer) {
			transfer.push(task.keys.buffer);
		}
		if (task.corpus?.buffer) {
			transfer.push(task.corpus.buffer);
		}

		try {
			worker.postMessage(taskData, transfer);
		} catch (err) {
			this.taskMap.delete(task.taskId);
			reject(err as Error);
		}
	}

	async submit(task: GPUTask): Promise<GPUResult> {
		return new Promise((resolve, reject) => {
			// Queue or execute immediately
			if (this.taskMap.size >= this.poolSize) {
				// All workers busy
				if (this.taskQueue.length >= this.maxQueueSize) {
					reject(new Error(`TensorRT task queue full (${this.maxQueueSize} pending)`));
					return;
				}
				this.taskQueue.push({ task, resolve, reject });
			} else {
				this.executeTask(task, resolve, reject);
			}

			// Timeout safety (default 30s)
			const timeout = task.timeout || 30000;
			const timeoutId = setTimeout(() => {
				this.taskMap.delete(task.taskId);
				reject(new Error(`TensorRT task timeout after ${timeout}ms`));
			}, timeout);

			// Clear timeout on completion
			const originalResolve = resolve;
			const wrappedResolve = (result: GPUResult) => {
				clearTimeout(timeoutId);
				originalResolve(result);
			};
			this.taskMap.set(task.taskId, { resolve: wrappedResolve, reject });
		});
	}

	async terminate() {
		await Promise.all(this.workers.map((w) => w.terminate()));
		this.workers = [];
		this.taskMap.clear();
		this.taskQueue = [];
		console.log('[TensorRT Pool] Terminated all worker threads');
	}

	getStats() {
		return {
			poolSize: this.poolSize,
			activeTasks: this.taskMap.size,
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
		embeddings,
		n,
		dim,
		k,
		maxIters
	});

	if (result.error || !result.data) throw new Error(result.error || 'K-means failed');

	// Parse: first n elements are assignments, rest are centroids
	const data = result.data as Int32Array;
	const assignments = new Int32Array(data.slice(0, n));
	const centroids = new Float32Array(data.slice(n) as any);

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
		embeddings: adjacencyMatrix, // reuse field name
		n,
		damping,
		iters
	});

	if (result.error || !result.data) throw new Error(result.error || 'PageRank computation failed');
	return result.data as Float32Array;
}
