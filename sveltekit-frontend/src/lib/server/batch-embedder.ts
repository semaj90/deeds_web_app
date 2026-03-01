/**
 * Batch embedding service with automatic batching window
 * Accumulates embedding requests and sends them in batches to Ollama
 *
 * Benefits:
 * - 32x faster for batch operations (GPU parallelism)
 * - Automatic cache integration
 * - Better GPU utilization
 */

import { ENV } from './env.server.js';
import { getCachedEmbedding, cacheEmbedding, batchGetCachedEmbeddings, batchCacheEmbeddings } from './embedding-cache.js';

const BATCH_SIZE = 32;
const BATCH_TIMEOUT_MS = 50; // 50ms batching window

interface QueuedRequest {
	text: string;
	resolve: (embedding: Float32Array) => void;
	reject: (error: Error) => void;
}

class BatchEmbedder {
	private queue: QueuedRequest[] = [];
	private timer: NodeJS.Timeout | null = null;

	/**
	 * Embed a single text (automatically batched)
	 * @param text - Text to embed
	 * @returns 768-dim Float32Array embedding
	 */
	async embed(text: string): Promise<Float32Array> {
		// Check cache first
		const cached = await getCachedEmbedding(text);
		if (cached) return cached;

		// Queue for batching
		return new Promise((resolve, reject) => {
			this.queue.push({ text, resolve, reject });

			// Flush if batch is full
			if (this.queue.length >= BATCH_SIZE) {
				this.flush();
			} else if (!this.timer) {
				// Start batching window timer
				this.timer = setTimeout(() => this.flush(), BATCH_TIMEOUT_MS);
			}
		});
	}

	/**
	 * Embed multiple texts in a single batch (bypasses batching window)
	 * @param texts - Array of texts to embed
	 * @returns Array of 768-dim Float32Array embeddings
	 */
	async embedBatch(texts: string[]): Promise<Float32Array[]> {
		if (texts.length === 0) return [];

		// Check cache for all texts
		const cachedEmbeddings = await batchGetCachedEmbeddings(texts);
		const uncachedIndices: number[] = [];
		const uncachedTexts: string[] = [];

		cachedEmbeddings.forEach((cached, i) => {
			if (!cached) {
				uncachedIndices.push(i);
				uncachedTexts.push(texts[i]);
			}
		});

		// If all cached, return early
		if (uncachedTexts.length === 0) {
			return cachedEmbeddings as Float32Array[];
		}

		// Fetch uncached embeddings from Ollama
		const freshEmbeddings = await this.fetchFromOllama(uncachedTexts);

		// Cache new embeddings
		await batchCacheEmbeddings(
			uncachedTexts.map((text, i) => ({
				text,
				embedding: freshEmbeddings[i]
			}))
		);

		// Merge cached + fresh
		const results: Float32Array[] = [];
		let freshIndex = 0;

		for (let i = 0; i < texts.length; i++) {
			if (cachedEmbeddings[i]) {
				results.push(cachedEmbeddings[i]!);
			} else {
				results.push(freshEmbeddings[freshIndex++]);
			}
		}

		return results;
	}

	/**
	 * Flush the current batch queue
	 */
	private async flush() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}

		const batch = this.queue.splice(0, BATCH_SIZE);
		if (batch.length === 0) return;

		try {
			const embeddings = await this.fetchFromOllama(batch.map((req) => req.text));

			// Cache all embeddings
			await batchCacheEmbeddings(
				batch.map((req, i) => ({
					text: req.text,
					embedding: embeddings[i]
				}))
			);

			// Resolve all promises
			for (let i = 0; i < batch.length; i++) {
				batch[i].resolve(embeddings[i]);
			}
		} catch (error) {
			// Reject all promises
			for (const req of batch) {
				req.reject(error as Error);
			}
		}
	}

	/**
	 * Fetch embeddings from Ollama (no caching)
	 */
	private async fetchFromOllama(texts: string[]): Promise<Float32Array[]> {
		const response = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'embeddinggemma:latest',
				input: texts
			})
		});

		if (!response.ok) {
			throw new Error(`Ollama embedding failed: ${response.statusText}`);
		}

		const data = await response.json();
		const embeddings = data.embeddings as number[][];

		return embeddings.map((arr) => new Float32Array(arr));
	}

	/**
	 * Get queue stats (for monitoring)
	 */
	getStats() {
		return {
			queueLength: this.queue.length,
			timerActive: this.timer !== null
		};
	}
}

// Singleton instance
export const batchEmbedder = new BatchEmbedder();

/**
 * Helper: Embed single text (uses batch embedder)
 */
export async function embedText(text: string): Promise<Float32Array> {
	return batchEmbedder.embed(text);
}

/**
 * Helper: Embed multiple texts (batch)
 */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
	return batchEmbedder.embedBatch(texts);
}
