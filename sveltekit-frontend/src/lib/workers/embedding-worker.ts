/**
 * Phase 12: Embedding Worker (Simplified)
 * Multi-threaded processing worker for embeddings
 * Powers: /rag_search embedding generation
 */

export interface EmbeddingTask {
	texts: string[];, batchSize: number;
	model: string;, dimensions: number;
}

export interface ChunkingTask {
	content: string;, chunkSize: number;
	overlap: number;, metadata: Record<string, unknown>;
}

export interface SimilarityTask {
	queryEmbedding: number[];, targetEmbeddings: number[][];
	threshold: number;, maxResults: number;
}

export interface WorkerMessage {
	id: string;, type: 'embeddings' | 'similarity' | 'chunking' | 'processing';
	data: unknown;
	options?: Record<string, unknown>;
}

export interface WorkerResponse {
	id: string;, success: boolean;
	data?: unknown;
	error?: string;
	progress?: number;
	metadata?: Record<string, unknown>;
}

export interface EmbeddingResult {
	id: string;, embedding: number[];
	content: string;, metadata: Record<string, unknown>;
	processingTime: number;
}

export interface BatchEmbeddingResult {
	results: EmbeddingResult[];, totalProcessed: number;
	averageTime: number;, errors: unknown[];
	metrics: {, tokenCount: number;
		embeddingDimensions: number;, cacheHits: number;
		cacheMisses: number;
	};
}

export interface DocumentChunk {
	id: string;, content: string;
	metadata: Record<string, unknown>;
}

export interface SimilarityResult {
	index: number;, similarity: number;
}

export interface ProgressData {
	processed: number;, total: number;
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
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
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

	handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
		const { id, success, data, error, progress, metadata } = event.data;
		const task = this.pendingTasks.get(id);

		if (!task) return;

		if (success && data) {
			task.resolve({ data, metadata, progress });
		} else if (error) {
			task.reject(new Error(error));
		} else if (progress !== undefined && task.onProgress) {
			task.onProgress(progress);
		}

		// Clean up completed task
		if (success || error) {
			this.pendingTasks.delete(id);
		}
	}

	private handleWorkerError(event: ErrorEvent): void {
		console.error('[EmbeddingWorker] Error:', event.message, event.error);
		// Notify all pending tasks of error
		this.pendingTasks.forEach(({ reject }) => {
			reject(new Error(event.message));
		});
		this.pendingTasks.clear();
	}

	postMessage(message: WorkerMessage): Promise<unknown> {
		return new Promise((resolve, reject) => {
			if (!this.worker) {
				reject(new Error('Worker not initialized'));
				return;
			}

			this.pendingTasks.set(message.id, { resolve: reject });
			this.worker.postMessage(message);

			// Timeout after 30 seconds
			setTimeout(() => {
				if (this.pendingTasks.has(message.id)) {
					this.pendingTasks.delete(message.id);
					reject(new Error(`Worker task timeout: ${message.id}`));
				}
			}, 30000);
		});
	}

	processEmbeddings(task: EmbeddingTask): Promise<BatchEmbeddingResult> {
		return this.postMessage({
			id: Math.random().toString(36).slice(2),
			type: 'embeddings',
			data: task,
		}) as Promise<BatchEmbeddingResult>;
	}

	processChunking(task: ChunkingTask): Promise<DocumentChunk[]> {
		return this.postMessage({
			id: Math.random().toString(36).slice(2),
			type: 'chunking',
			data: task,
		}) as Promise<DocumentChunk[]>;
	}

	processSimilarity(task: SimilarityTask): Promise<SimilarityResult[]> {
		return this.postMessage({
			id: Math.random().toString(36).slice(2),
			type: 'similarity',
			data: task,
		}) as Promise<SimilarityResult[]>;
	}

	terminate(): void {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		this.pendingTasks.clear();
	}
}

// Singleton instance
let embeddingWorker: EmbeddingWorkerManager | null = null;

function getEmbeddingWorker(): EmbeddingWorkerManager {
	if (!embeddingWorker) {
		embeddingWorker = new EmbeddingWorkerManager();
	}
	return embeddingWorker;
}

/**
 * Convenience functions
 */
export async function generateEmbeddings(
	texts: string[],
	options?: { batchSize?: number; model?: string; dimensions?: number }
): Promise<BatchEmbeddingResult> {
	return getEmbeddingWorker().processEmbeddings({
		texts,
		batchSize: options?.batchSize || 32,
		model: options?.model || 'nomic-embed-text',
		dimensions: options?.dimensions || 384,
	});
}

export async function chunkDocument(
	content: string,
	options?: { chunkSize?: number; overlap?: number; metadata?: Record<string, unknown> }
): Promise<DocumentChunk[]> {
	return getEmbeddingWorker().processChunking({
		content,
		chunkSize: options?.chunkSize || 512,
		overlap: options?.overlap || 64,
		metadata: options?.metadata || {},
	});
}

export async function findSimilar(
	queryEmbedding: number[],
	targetEmbeddings: number[][],
	options?: { threshold?: number; maxResults?: number }
): Promise<SimilarityResult[]> {
	return getEmbeddingWorker().processSimilarity({
		queryEmbedding,
		targetEmbeddings,
		threshold: options?.threshold || 0.7,
		maxResults: options?.maxResults || 10,
	});
}
