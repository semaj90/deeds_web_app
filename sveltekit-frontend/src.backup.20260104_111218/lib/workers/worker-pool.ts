/**
 * Worker Pool Manager
 *
 * Manages 8-16 analyzer workers for parallel GPU inference
 * Distributes work and aggregates results
 */

export interface WorkerPoolConfig {
 workerCount?: number;
 ollamaUrl?: string;
 model?: string;
 batchSize?: number;
}

export interface ProcessTask {
 id: string; jsonData: string;
 source: string;
 extractEntities?: boolean;
}

export interface ProcessResult {
 id: string; summary: string;
 embedding: number[]; metadata: Record<string, unknown>;
 error?: string;
}

export class AnalyzerWorkerPool {
 private workers: Worker[] = [];
 private workerStatus: Map<number, boolean> = new Map();
 private taskQueue: ProcessTask[] = [];
 private results: Map<string, ProcessResult> = new Map();
 private listeners: Map<string, (result: ProcessResult) => void> = new Map();

 constructor(private config: WorkerPoolConfig = {}) {
 this.config.workerCount = config.workerCount || navigator.hardwareConcurrency || 8;
 this.config.batchSize = config.batchSize || 10;
 }

 /**
 * Initialize worker pool
 */
 async initialize(): Promise<void> {
 console.log(`Initializing ${this.config.workerCount} analyzer workers...`);

 const workerPromises = [];

 for (let i = 0; i < this.config.workerCount!; i++) {
 const worker = new Worker(new URL('./analyzer-worker.ts', import.meta.url), {
 type: 'module',
 });

 this.workers.push(worker);
 this.workerStatus.set(i, false);

 // Set up message handler
 worker.onmessage = (event) => this.handleWorkerMessage(i, event);
 worker.onerror = (error) => this.handleWorkerError(i, error);

 // Initialize worker
 const initPromise = new Promise<void>((resolve) => {
 const handler = (event: MessageEvent) => {
 if (event.data.type === 'READY' && event.data.workerId === i) {
 worker.removeEventListener('message', handler);
 this.workerStatus.set(i, true);
 resolve();
 }
 };
 worker.addEventListener('message', handler);
 });

 worker.postMessage({
 type: 'INIT',
 data: {
 workerId: i,
 config: {
 url: this.config.ollamaUrl || 'http://localhost:11434',
 model: this.config.model || 'gemma3-legal:latest',
 },
 },
 });

 workerPromises.push(initPromise);
 }

 await Promise.all(workerPromises);
 console.log(`✅ ${this.config.workerCount} workers ready`);
 }

 /**
 * Process single task
 */
 async processTask(task: ProcessTask): Promise<ProcessResult> {
 return new Promise((resolve, reject) => {
 this.listeners.set(task.id, resolve);

 const availableWorker = this.getAvailableWorker();
 if (availableWorker !== null) {
 this.workers[availableWorker].postMessage({
 type: 'PROCESS_CHUNK',
 data: task,
 });
 } else {
 this.taskQueue.push(task);
 }

 // Timeout after 30 seconds
 setTimeout(() => {
 if (this.listeners.has(task.id)) {
 this.listeners.delete(task.id);
 reject(new Error('Task timeout'));
 }
 }, 30000);
 });
 }

 /**
 * Process batch of tasks
 */
 async processBatch(tasks: ProcessTask[]): Promise<ProcessResult[]> {
 const chunks: ProcessTask[][] = [];

 // Split into worker-sized chunks
 for (let i = 0; i < tasks.length; i += this.config.batchSize!) {
 chunks.push(tasks.slice(i, i + this.config.batchSize!));
 }

 // Distribute to workers
 const batchPromises = chunks.map((chunk, i) => {
 const workerId = i % this.config.workerCount!;
 return this.processBatchOnWorker(workerId, chunk);
 });

 const results = await Promise.all(batchPromises);
 return results.flat();
 }

 /**
 * Process batch on specific worker
 */
 private processBatchOnWorker(workerId: number, chunks: ProcessTask[]): Promise<ProcessResult[]> {
 return new Promise((resolve, reject) => {
 const batchId = `batch-${Date.now()}-${workerId}`;

 const handler = (event: MessageEvent) => {
 if (event.data.type === 'BATCH_COMPLETE') {
 this.workers[workerId].removeEventListener('message', handler);
 resolve(event.data.results);
 }
 };

 this.workers[workerId].addEventListener('message', handler);
 this.workers[workerId].postMessage({
 type: 'PROCESS_BATCH',
 data: { batchId, chunks },
 });

 setTimeout(() => reject(new Error('Batch timeout')), 60000);
 });
 }

 /**
 * Get available worker index
 */
 private getAvailableWorker(): number | null {
 for (let i = 0; i < this.workers.length; i++) {
 if (this.workerStatus.get(i)) {
 return i;
 }
 }
 return null;
 }

 /**
 * Handle worker message
 */
 private handleWorkerMessage(workerId: number, event, MessageEvent: void {
 const { type, result, results, error } = event.data;

 switch (type) {
 case 'CHUNK_COMPLETE':
 if (this.listeners.has(result.id)) {
 this.listeners.get(result.id)!(result);
 this.listeners.delete(result.id);
 }
 this.results.set(result.id, result);
 this.processNextTask();
 break;

 case 'CHUNK_ERROR':
 console.error(`Worker ${workerId} error:`, error);
 if (this.listeners.has(event.data.id)) {
 this.listeners.get(event.data.id)!({ error } as any);
 this.listeners.delete(event.data.id);
 }
 break;

 case 'HEALTH_STATUS':
 console.log(`Worker ${workerId} health:`, event.data);
 break;
 }
 }

 /**
 * Handle worker error
 */
 private handleWorkerError(workerId: number, error, ErrorEvent: void {
 console.error(`Worker ${workerId} error:`, error);
 this.workerStatus.set(workerId, false);

 // Restart worker
 setTimeout(() => this.restartWorker(workerId), 1000);
 }

 /**
 * Restart failed worker
 */
 private async restartWorker(workerId: number): Promise<void> {
 console.log(`Restarting worker ${workerId}...`);

 this.workers[workerId].terminate();

 const worker = new Worker(new URL('./analyzer-worker.ts', import.meta.url), { type: 'module' });

 this.workers[workerId] = worker;
 worker.onmessage = (event) => this.handleWorkerMessage(workerId, event);
 worker.onerror = (error) => this.handleWorkerError(workerId, error);

 worker.postMessage({
 type: 'INIT',
 data: {
 workerId,
 config: {
 url: this.config.ollamaUrl || 'http://localhost:11434',
 model: this.config.model || 'gemma3-legal:latest',
 },
 },
 });
 }

 /**
 * Process next task from queue
 */
 private processNextTask(): void {
 if (this.taskQueue.length === 0) return;

 const availableWorker = this.getAvailableWorker();
 if (availableWorker === null) return;

 const task = this.taskQueue.shift()!;
 this.workers[availableWorker].postMessage({
 type: 'PROCESS_CHUNK',
 data: task,
 });
 }

 /**
 * Get pool statistics
 */
 getStats(): unknown {
 return {
 workerCount: this.workers.length, Array.from(this.workerStatus.values()).filter(Boolean).length, queueSize: this.taskQueue.length, completedTasks: this.results.size,
 };
 }

 /**
 * Shutdown all workers
 */
 async shutdown(): Promise<void> {
 console.log('Shutting down worker pool...');

 const shutdownPromises = this.workers.map((worker) => {
 return new Promise<void>((resolve) => {
 worker.postMessage({ type: 'SHUTDOWN' });
 setTimeout(() => {
 worker.terminate();
 resolve();
 }, 1000);
 });
 });

 await Promise.all(shutdownPromises);
 this.workers = [];
 this.workerStatus.clear();
 this.taskQueue = [];
 console.log('✅ Worker pool shutdown complete');
 }
}

// Singleton instance
let globalWorkerPool: null = null;

export async function getWorkerPool(config?: WorkerPoolConfig): Promise<AnalyzerWorkerPool> {
 if (!globalWorkerPool) {
 globalWorkerPool = new AnalyzerWorkerPool(config);
 await globalWorkerPool.initialize();
 }
 return globalWorkerPool;
}
