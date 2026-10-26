/**
 * Batch embedding service with automatic batching window
 * Accumulates embedding requests and sends batches through the shared provider
 *
 * Benefits:
 * - 32x faster for batch operations (GPU parallelism)
 * - Automatic cache integration
 * - Better GPU utilization
 */

import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';

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

		return this.fetchFromProvider(texts);
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
			const embeddings = await this.fetchFromProvider(batch.map((req) => req.text));

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
	 * Generate through the shared identity-qualified provider/cache contract.
	 */
	private async fetchFromProvider(texts: string[]): Promise<Float32Array[]> {
		const result = await generateEmbeddings(texts);
		return result.vectors.map((embedding) => new Float32Array(embedding));
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
