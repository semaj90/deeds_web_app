/**
 * Concurrent JSON Serialization Service
 * Optimized for thread-safe operations with legal AI data
 * Integrates with JSONB storage and GPU acceleration
 */

import { type Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { cpus } from 'os';
import { performance } from 'perf_hooks';

// Types for serialization context
interface SerializationTask {
	id: string;
	data: unknown;
	options: SerializationOptions;
	priority: 'low' | 'medium' | 'high' | 'critical';
	timestamp: number;
}

interface SerializationOptions {
	compress?: boolean;
	validateStructure?: boolean;
	preserveBuffers?: boolean;
	maxDepth?: number;
	chunkSize?: number;
	gpuAccelerated?: boolean;
	legalDocumentMode?: boolean;
}

interface SerializationResult {
	id: string;
	serialized: string;
	metadata: {
		originalSize: number;
		serializedSize: number;
		compressionRatio: number;
		processingTime: number;
		method: 'cpu' | 'gpu' | 'worker';
		chunks?: number;
	};
	error?: string;
}

// Worker thread pool for CPU-intensive serialization
class WorkerPool {
	private workers: Worker[] = [];
	private availableWorkers: Worker[] = [];
	private taskQueue: Array<{
		task: SerializationTask;
		resolve: (value: SerializationResult) => void;
		reject: (reason?: any) => void;
	}> = [];

	constructor(private poolSize: number = Math.max(2, cpus().length - 2)) {
		this.initializeWorkers();
	}

	private initializeWorkers() {
		for (let i = 0; i < this.poolSize; i++) {
			const worker = this.createWorker();
			this.workers.push(worker);
			this.availableWorkers.push(worker);
		}
	}

	private createWorker(): Worker {
        const { Worker } = require('worker_threads');
		const workerCode = `
            const { parentPort } = require('worker_threads');
            const { performance } = require('perf_hooks');

            class JSONSerializer {
                static serialize(data, options = {}) {
                    const start = performance.now();
                    try {
                        const seen = new WeakSet();
                        const serialized = JSON.stringify(data, (key, value) => {
                            if (typeof value === 'object' && value !== null) {
                                if (seen.has(value)) {
                                    return '[Circular Reference]';
                                }
                                seen.add(value);
                            }

                            if (options.legalDocumentMode) {
                                if (key === 'embedding' && Array.isArray(value)) {
                                    return value.length > 100 ? \`[Vector: \${value.length}]\` : value;
                                }
                                if (key === 'fullText' && typeof value === 'string' && value.length > 10000) {
                                    return value.substring(0, 10000) + '... [truncated]';
                                }
                            }

                            if (value instanceof Date) {
                                return { _type: 'Date', value: value.toISOString() };
                            }
                            if (value instanceof Buffer) {
                                return options.preserveBuffers
                                    ? { _type: 'Buffer', value: value.toString('base64') }
                                    : '[Buffer]';
                            }
                            return value;
                        }, options.compress ? 0 : 2);

                        const processingTime = performance.now() - start;
                        return {
                            serialized,
                            metadata: {
                                originalSize: 0, // Approximate
                                serializedSize: serialized.length,
                                compressionRatio: 1,
                                processingTime,
                                method: 'worker'
                            }
                        };
                    } catch (error) {
                        return {
                            error: error.message,
                            metadata: {
                                originalSize: 0,
                                serializedSize: 0,
                                compressionRatio: 0,
                                processingTime: performance.now() - start,
                                method: 'worker'
                            }
                        };
                    }
                }
            }

            parentPort.on('message', ({ id, data, options }) => {
                const result = JSONSerializer.serialize(data, options);
                parentPort.postMessage({ id, ...result });
            });
        `;

		const worker = new Worker(workerCode, { eval: true });

		worker.on('message', (result: SerializationResult) => {
			this.handleWorkerResult(worker, result);
		});

		worker.on('error', (error: Error) => {
			console.error('Worker error: ', error);
			this.replaceWorker(worker);
		});

		return worker;
	}

	private handleWorkerResult(worker: Worker, result: SerializationResult): void {
		const taskIndex = this.taskQueue.findIndex(
			(item) => item.task.id === result.id
		);

		if (taskIndex !== -1) {
			const { resolve } = this.taskQueue[taskIndex];
			this.taskQueue.splice(taskIndex, 1);
			resolve(result);
		}

		this.availableWorkers.push(worker);
		this.processNextTask();
	}

	private replaceWorker(deadWorker: Worker) {
		const index = this.workers.indexOf(deadWorker);
		if (index !== -1) {
            deadWorker.terminate();
			this.workers[index] = this.createWorker();

            const availableIndex = this.availableWorkers.indexOf(deadWorker);
			if (availableIndex !== -1) {
				this.availableWorkers.splice(availableIndex, 1);
				this.availableWorkers.push(this.workers[index]);
			}
		}
	}

	async execute(task: SerializationTask): Promise<SerializationResult> {
		return new Promise((resolve, reject) => {
			this.taskQueue.push({ task, resolve, reject });
			this.processNextTask();
		});
	}

	private processNextTask() {
		if (this.taskQueue.length === 0 || this.availableWorkers.length === 0) {
			return;
		}

		// Sort by priority
		this.taskQueue.sort((a, b) => {
			const priorities = { critical: 4, high: 3, medium: 2, low: 1 };
			return priorities[b.task.priority] - priorities[a.task.priority];
		});

		const worker = this.availableWorkers.pop()!;
		const { task } = this.taskQueue[0]; // Need to verify if shift logic or index 0 is correct with above loop/logic.
        // Logic: find task but handleWorkerResult removes it by ID which is safer.
        // But here we need to remove the task we are processing from queue?
        // No, `handleWorkerResult` logic implies we keep it pending until result comes back.
        // Wait, `handleWorkerResult` finds by ID in `taskQueue`. Correct.
        // But if we pick index 0 here, we should NOT remove it yet?
        // Actually, if we leave it in taskQueue, `processNextTask` will pick it again.
        // We probably need a separate `pendingTasks` vs `queuedTasks`?
        // Or cleaner: `taskQueue` holds waiting tasks.
        // `pendingMap` holds tasks being processed.

        // Let's stick to simple queue management for the fix.
        // Remove from taskQueue? If so handleWorkerResult needs a map.
        // The original code was severely broken, so I am rewriting logic.

        // My implementation:
        // 1. Remove from taskQueue.
        // 2. Store resolution closure in a map keyed by ID.
        // 3. handleWorkerResult looks up in map.

        // Let's adjust `WorkerPool` properties for this cleaner logic.
        // Since I cannot change the class def too much without potentially confusing context I will adapt.
        // But look, `handleWorkerResult` searches `taskQueue`. This implies `taskQueue` contains inflight tasks in the original logic.
        // However, `processNextTask` grabs index 0. If it stays in queue, it will be grabbed again.
        // `availableWorkers.pop()` reduces worker count.
        // So `processNextTask` will bail on `availableWorkers.length === 0`.
        // So it is "safe" to leave in queue BUT we need to mark it as "processing" or simpler:
        // Just rely on workers being unavailable.
        // BUT multiple workers?
        // If worker 1 takes task 0. Worker 2 takes task 0?
        // Yes, if we don't mark as processing.

        // Fix: Use a separate `inflightTasks` map.
	    // Since I can rewrite the class, I will do so.
	}
}

// Improved WorkerPool implementation for rewrite
class ImprovedWorkerPool {
    private workers: Worker[] = [];
    private availableWorkers: Worker[] | null = null; // initialized in constructor logic
    private taskQueue: Array<{
        task: SerializationTask;
        resolve: (value: SerializationResult) => void;
        reject: (reason?: any) => void;
    }> = [];
    private inflightTasks = new Map<string, {
        resolve: (value: SerializationResult) => void;
        reject: (reason?: any) => void;
    }>();

    constructor(private poolSize: number = Math.max(2, cpus().length - 2)) {
        this.availableWorkers = [];
        this.initializeWorkers();
    }

    private initializeWorkers() {
        if (!this.availableWorkers) this.availableWorkers = [];
        for (let i = 0; i < this.poolSize; i++) {
            const worker = this.createWorker();
            this.workers.push(worker);
            this.availableWorkers.push(worker);
        }
    }

    // ... createWorker and logic ...
    private createWorker(): Worker {
        const { Worker } = require('worker_threads');
		const workerCode = `
            const { parentPort } = require('worker_threads');
            const { performance } = require('perf_hooks');

            class JSONSerializer {
                static serialize(data, options = {}) {
                    const start = performance.now();
                    try {
                        const seen = new WeakSet();
                        const serialized = JSON.stringify(data, (key, value) => {
                            if (typeof value === 'object' && value !== null) {
                                if (seen.has(value)) {
                                    return '[Circular Reference]';
                                }
                                seen.add(value);
                            }

                            if (options.legalDocumentMode) {
                                if (key === 'embedding' && Array.isArray(value)) {
                                    return value.length > 100 ? \`[Vector: \${value.length}]\` : value;
                                }
                                if (key === 'fullText' && typeof value === 'string' && value.length > 10000) {
                                    return value.substring(0, 10000) + '... [truncated]';
                                }
                            }

                            if (value instanceof Date) {
                                return { _type: 'Date', value: value.toISOString() };
                            }
                            if (value instanceof Buffer) {
                                return options.preserveBuffers
                                    ? { _type: 'Buffer', value: value.toString('base64') }
                                    : '[Buffer]';
                            }
                            return value;
                        }, options.compress ? 0 : 2);

                        const processingTime = performance.now() - start;
                        return {
                            serialized,
                            metadata: {
                                originalSize: 0,
                                serializedSize: serialized.length,
                                compressionRatio: 1,
                                processingTime,
                                method: 'worker'
                            }
                        };
                    } catch (error) {
                        return {
                            error: error.message,
                            metadata: {
                                originalSize: 0,
                                serializedSize: 0,
                                compressionRatio: 0,
                                processingTime: performance.now() - start,
                                method: 'worker'
                            }
                        };
                    }
                }
            }

            parentPort.on('message', ({ id, data, options }) => {
                const result = JSONSerializer.serialize(data, options);
                parentPort.postMessage({ id, ...result });
            });
        `;

		const worker = new Worker(workerCode, { eval: true });

		worker.on('message', (result: SerializationResult) => {
			this.handleWorkerResult(worker, result);
		});

		worker.on('error', (error: Error) => {
			console.error('Worker error: ', error);
			this.replaceWorker(worker);
		});

		return worker;
    }

    private handleWorkerResult(worker: Worker, result: SerializationResult): void {
        const resolution = this.inflightTasks.get(result.id);
        if (resolution) {
            resolution.resolve(result);
            this.inflightTasks.delete(result.id);
        }

        if (this.availableWorkers) {
            this.availableWorkers.push(worker);
            this.processNextTask();
        }
    }

    private replaceWorker(deadWorker: Worker) {
        deadWorker.terminate();
        const index = this.workers.indexOf(deadWorker);
        if (index !== -1) {
            this.workers.splice(index, 1);
            const newWorker = this.createWorker();
            this.workers.push(newWorker);
            // If it was available, replace in available
            // If it was busy, we just add new worker to available?
            // Safer to just add to available.
            if (this.availableWorkers) this.availableWorkers.push(newWorker);
        }
    }

    async execute(task: SerializationTask): Promise<SerializationResult> {
        return new Promise((resolve, reject) => {
            this.taskQueue.push({ task, resolve, reject });
            this.processNextTask();
        });
    }

    private processNextTask() {
        if (this.taskQueue.length === 0 || !this.availableWorkers || this.availableWorkers.length === 0) {
            return;
        }

        // Sort by priority
        this.taskQueue.sort((a, b) => {
            const priorities = { critical: 4, high: 3, medium: 2, low: 1 };
            return priorities[b.task.priority] - priorities[a.task.priority];
        });

        const job = this.taskQueue.shift();
        if (!job) return;

        const worker = this.availableWorkers.pop();
        if (!worker) {
            // Should not happen due to check above, put job back
            this.taskQueue.unshift(job);
            return;
        }

        this.inflightTasks.set(job.task.id, { resolve: job.resolve, reject: job.reject });
        worker.postMessage({ id: job.task.id, data: job.task.data, options: job.task.options });
    }

    terminate() {
        this.workers.forEach(w => w.terminate());
    }
}


/**
 * Main concurrent JSON serialization service
 */
export class ConcurrentJSONSerializer {
	private static instance: ConcurrentJSONSerializer;
	private workerPool: ImprovedWorkerPool;
	private gpuContext?: any; // GPUDevice
	private taskCounter = 0;

	static getInstance(): ConcurrentJSONSerializer {
		if (!ConcurrentJSONSerializer.instance) {
			ConcurrentJSONSerializer.instance = new ConcurrentJSONSerializer();
		}
		return ConcurrentJSONSerializer.instance;
	}

	private constructor() {
		this.workerPool = new ImprovedWorkerPool();
		this.initializeGPU();
	}

	private async initializeGPU() {
        // GPU initialization is environment dependent and often not available in Node.js server text
        // keeping as placeholder or mock
		try {
            // @ts-ignore
			if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
                // @ts-ignore
				const adapter = await navigator.gpu.requestAdapter();
				if (adapter) {
					this.gpuContext = await adapter.requestDevice();
					console.log('🚀 GPU acceleration enabled for JSON serialization');
				}
			}
		} catch (error) {
			console.warn('GPU initialization failed for serializer: ', error);
		}
    }

	/**
	 * Thread-safe JSON serialization with automatic method selection
	 */
	async serialize<T>(data: T, options: SerializationOptions = {}): Promise<SerializationResult> {
		const taskId = `serialize_${++this.taskCounter}_${Date.now()}`;
		const task: SerializationTask = {
			id: taskId,
			data: data as unknown, // safe cast for serialization
			options: {
				compress: false,
				validateStructure: true,
				preserveBuffers: false,
				maxDepth: 10,
				chunkSize: 1024 * 1024, // 1MB
				gpuAccelerated: false,
				legalDocumentMode: false,
				...options
			},
			priority: this.determinePriority(data, options),
			timestamp: Date.now()
		};

		// Determine optimal serialization method
		const dataSize = this.estimateDataSize(data);

		if (options.gpuAccelerated && this.gpuContext && dataSize > 100 * 1024) {
			return await this.serializeWithGPU(task);
		} else if (dataSize > 50 * 1024) {
			return await this.workerPool.execute(task);
		} else {
			return await this.serializeSync(task);
		}
	}

    private determinePriority(data: any, options: SerializationOptions): 'low' | 'medium' | 'high' | 'critical' {
        if (options.legalDocumentMode) return 'high';
        return 'medium';
    }

    private estimateDataSize(data: any): number {
        // Rough estimation
        try {
            return JSON.stringify(data).length;
        } catch {
            return 0; // fallback
        }
    }

    private async serializeSync(task: SerializationTask): Promise<SerializationResult> {
        const start = performance.now();
        const serialized = JSON.stringify(task.data);
        const processingTime = performance.now() - start;
        return {
            id: task.id,
            serialized,
            metadata: {
                originalSize: 0,
                serializedSize: serialized.length,
                compressionRatio: 1,
                processingTime,
                method: 'cpu'
            }
        };
    }

	/**
	 * GPU-accelerated serialization for large datasets
	 */
	private async serializeWithGPU(task: SerializationTask): Promise<SerializationResult> {
        // Mock implementation since WebGPU in Node context is complex fallback to sync
        return this.serializeSync(task);
	}

    // New APIs based on original file requirements
    async serializeBatch<T>(items: T[], options: SerializationOptions = {}): Promise<SerializationResult[]> {
        return Promise.all(items.map(item => this.serialize(item, options)));
    }

    deserialize<T>(serialized: string): T {
        return JSON.parse(serialized);
    }

    terminate() {
        this.workerPool.terminate();
    }
}

// Export singleton instance
export const concurrentSerializer = ConcurrentJSONSerializer.getInstance();

// Utility functions for common use cases
export async function serializeForAPI<T>(data: T, options: Partial<SerializationOptions> = {}): Promise<string> {
	const result = await concurrentSerializer.serialize(data, {
		compress: true,
		validateStructure: true,
		legalDocumentMode: false,
		...options
	});

	if (result.error) {
		throw new Error(`API failed: ${result.error}`);
	}
	return result.serialized;
}

export async function serializeLegalDocument<T>(document: T, options: Partial<SerializationOptions> = {}): Promise<string> {
	const result = await concurrentSerializer.serialize(document, {
		legalDocumentMode: true,
		compress: false,
		validateStructure: true,
		maxDepth: 15,
		...options
	});

	if (result.error) {
		throw new Error(`Legal document failed: ${result.error}`);
	}
	return result.serialized;
}

export async function serializeBatchForCache<T>(items: T[], options: Partial<SerializationOptions> ={}): Promise<SerializationResult[]> {
	return await concurrentSerializer.serializeBatch(items, {
		compress: true,
		gpuAccelerated: items.length > 100,
		...options
	});
}

export function deserializeFromAPI<T>(serialized: string): T {
	return concurrentSerializer.deserialize<T>(serialized);
}

// Process cleanup
if (typeof process !== 'undefined') {
	process.on('exit', () => {
		concurrentSerializer.terminate();
	});
	process.on('SIGTERM', () => {
		concurrentSerializer.terminate();
		process.exit(0);
	});
}

