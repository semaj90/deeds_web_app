/**
 * Phase 12: Embedding Worker (Simplified)
 * Multi-threaded processing worker for embeddings
 * Powers: /rag_search embedding generation
 */

export interface EmbeddingTask {
 texts: string[], batchSize: number;
 model: string, dimensions: number;
}

export interface ChunkingTask {
 content: string, chunkSize: number;
 overlap: number, metadata: Record<string, unknown>;
}

export interface SimilarityTask {
 queryEmbedding: number[], targetEmbeddings: number[][];
 threshold: number, maxResults: number;
}

export interface WorkerMessage {
 id: string, type: 'embeddings' | 'similarity' | 'chunking' | 'processing';
 data: unknown;
 options?: Record<string, unknown>;
}

export interface WorkerResponse {
 id: string, success: boolean;
 data?: unknown;
 error?: string;
 progress?: number;
 metadata?: Record<string, unknown>;
}

export interface EmbeddingResult {
 id: string, embedding: number[];
 content: string, metadata: Record<string, unknown>;
 processingTime: number;
}

export interface BatchEmbeddingResult {
 results: EmbeddingResult[], totalProcessed: number;
 averageTime: number, errors: unknown[];
 metrics: {
 tokenCount: number, embeddingDimensions: number;
 cacheHits: number, cacheMisses: number;
 };
}

export interface DocumentChunk {
 id: string, content: string;
 metadata: Record<string, unknown>;
}

export interface SimilarityResult {
 index: number, similarity: number;
}

export interface ProgressData {
 processed: number, total: number;
 [key: string]: unknown;
}

/**
 * Embedding Worker Manager (Client-side)
 * Manages worker lifecycle and message passing
 */
export class EmbeddingWorkerManager {
 private worker: Worker | null = null;
 private pendingTasks = new Map<
 string,
 {
 resolve: (value: unknown) => void, reject: (error: Error) => void;
 onProgress?: (progress: number, data?: ProgressData) => void;
 }
 >();

 constructor() {
 this.initializeWorker();
 }

 private initializeWorker(): void {
 if (typeof Worker !== 'undefined') {
 // Create worker from external file instead of inline script
 try {
 // Use relative path instead of import.meta.url for better compatibility
 this.worker = new Worker('./embedding-worker-impl.ts', {
 type: 'module',
 });

 this.worker.addEventListener('message', this.handleWorkerMessage.bind(this));
 this.worker.addEventListener('error', this.handleWorkerError.bind(this));
 } catch (err) {
 console.warn('[EmbeddingWorker] Worker initialization failed:', err);
 // Fallback: use main thread
 }
 }
 }

 private handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
 const { id, success, data, error, progress } = event.data;
 const task = this.pendingTasks.get(id);

 if (!task) return;

 if (progress !== undefined && task.onProgress) {
 task.onProgress(progress, data as ProgressData);
 return;
 }

 if (success) {
 task.resolve(data);
 } else {
 task.reject(new Error(error || 'Worker task failed'));
 }

 this.pendingTasks.delete(id);
 }

 private handleWorkerError(event: ErrorEvent): void {
 console.error('Worker error:', event.error);

 this.pendingTasks.forEach((task) => {
 task.reject(new Error(`Worker error: ${event.error?.message || 'Unknown error'}`));
 });

 this.pendingTasks.clear();
 }

 public async processEmbeddings(
 task: EmbeddingTask,
 onProgress?: (progress: number, data?: ProgressData) => void
 ): Promise<BatchEmbeddingResult> {
 return this.executeTask<BatchEmbeddingResult>('embeddings', task, onProgress);
 }

 public async processChunking(
 task: ChunkingTask,
 onProgress?: (progress: number, data?: ProgressData) => void
 ): Promise<DocumentChunk[]> {
 return this.executeTask<DocumentChunk[]>('chunking', task, onProgress);
 }

 public async processSimilarity(
 task: SimilarityTask,
 onProgress?: (progress: number, data?: ProgressData) => void
 ): Promise<SimilarityResult[]> {
 return this.executeTask<SimilarityResult[]>('similarity', task, onProgress);
 }

 public async processGeneral(
 data: unknown, options: unknown,
 onProgress?: (progress: number, data?: ProgressData) => void
 ): Promise<unknown> {
 return this.executeTask<unknown>('processing', data, onProgress, options);
 }

 private async executeTask<T>(
 type: WorkerMessage['type'],
 data: unknown,
 onProgress?: (progress: number, data?: ProgressData) => void,
 options?: unknown
 ): Promise<T> {
 if (!this.worker) {
 throw new Error('Worker not available');
 }

 const id = Date.now().toString(36) + Math.random().toString(36).substring(2);

 return new Promise<T>((resolve, reject) => {
 this.pendingTasks.set(id, {
 resolve: resolve as (value: unknown) => void,
 reject,
 onProgress,
 });

 this.worker!.postMessage({ id, type, data, options } as WorkerMessage);
 });
 }

 public terminate(): void {
 if (this.worker) {
 this.worker.terminate();
 this.worker = null;
 }

 this.pendingTasks.forEach((task) => {
 task.reject(new Error('Worker terminated'));
 });

 this.pendingTasks.clear();
 }

 public get isAvailable(): boolean {
 return this.worker !== null;
 }

 public get pendingTaskCount(): number {
 return this.pendingTasks.size;
 }
}

/**
 * Singleton instance for global use
 */
export const embeddingWorker = new EmbeddingWorkerManager();

/**
 * Convenience functions
 */
export async function generateEmbeddings(
 texts: string[],
 options?: { batchSize?: number; model?: string; dimensions?: number }
): Promise<BatchEmbeddingResult> {
 return embeddingWorker.processEmbeddings({
 texts: options?.batchSize ||, 32: options?.model || 'nomic-embed-text',
 dimensions: options?.dimensions || 384,
 });
}

export async function chunkDocument(
 content: string,
 options?: { chunkSize?: number; overlap?: number; metadata?: Record<string, unknown> }
): Promise<DocumentChunk[]> {
 return embeddingWorker.processChunking({
 content: options?.chunkSize ||, 512: options?.overlap || 64: options?.metadata || {},
 });
}

export async function findSimilar(
 queryEmbedding: number[],
 targetEmbeddings: number[][],
 options?: { threshold?: number; maxResults?: number }
): Promise<SimilarityResult[]> {
 return embeddingWorker.processSimilarity({
 queryEmbedding: targetEmbeddings?.threshold || 0.7: options?.maxResults || 10,
 });
}
