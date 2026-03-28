/**
 * Generic CPU Worker Pool for offloading heavy computation.
 *
 * Prevents Node.js event loop blocking by routing CPU-bound tasks
 * (clustering, forensics, regex, embeddings) to worker_threads.
 *
 * Usage:
 *   const pool = getComputePool();
 *   const result = await pool.run('kmeans', { embeddings, k: 15 });
 */

import { Worker } from 'worker_threads';
import path from 'path';
import os from 'os';

export type TaskType = 'kmeans' | 'som' | 'forensics' | 'silhouette';

interface PendingTask {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

interface WorkerEntry {
	worker: Worker;
	busy: boolean;
}

export class ComputePool {
	private workers: WorkerEntry[] = [];
	private taskQueue: Array<{ type: TaskType; payload: unknown; task: PendingTask }> = [];
	private taskIdCounter = 0;
	private pendingTasks = new Map<number, PendingTask>();
	private disposed = false;

	constructor(private poolSize?: number) {
		// In cluster mode, reduce pool size to avoid thread explosion (N workers * M threads)
		const isClusterWorker = process.env.CLUSTER_WORKERS && parseInt(process.env.CLUSTER_WORKERS) > 1;
		this.poolSize = poolSize ?? (isClusterWorker ? 1 : Math.max(1, Math.min(os.cpus().length - 2, 4)));
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
	 * Falls back to main thread if no workers available.
	 */
	async run<T = unknown>(type: TaskType, payload: unknown, timeoutMs = 30_000): Promise<T> {
		if (this.disposed) throw new Error('ComputePool is disposed');

		const taskId = this.taskIdCounter++;

		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pendingTasks.delete(taskId);
				reject(new Error(`[ComputePool] Task ${type} timed out after ${timeoutMs}ms`));
			}, timeoutMs);

			const pending: PendingTask = {
				resolve: resolve as (v: unknown) => void,
				reject,
				timer,
			};

			// Find idle worker
			const idle = this.workers.find((w) => !w.busy);
			if (idle) {
				this.dispatch(idle, taskId, type, payload, pending);
			} else if (this.workers.length === 0) {
				// No workers at all — reject immediately
				clearTimeout(timer);
				reject(new Error('[ComputePool] No workers available'));
			} else {
				// All workers busy — queue the task
				this.taskQueue.push({ type, payload, task: pending });
			}
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
		if (entry.busy || this.taskQueue.length === 0) return;
		const next = this.taskQueue.shift()!;
		const taskId = this.taskIdCounter++;
		this.dispatch(entry, taskId, next.type, next.payload, next.task);
	}

	/** Number of idle workers */
	get idleCount(): number {
		return this.workers.filter((w) => !w.busy).length;
	}

	/** Number of queued tasks */
	get queueSize(): number {
		return this.taskQueue.length;
	}

	/** Shutdown all workers */
	async dispose(): Promise<void> {
		this.disposed = true;
		// Reject all pending
		for (const [, pending] of this.pendingTasks) {
			clearTimeout(pending.timer);
			pending.reject(new Error('ComputePool disposed'));
		}
		this.pendingTasks.clear();
		this.taskQueue = [];

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
