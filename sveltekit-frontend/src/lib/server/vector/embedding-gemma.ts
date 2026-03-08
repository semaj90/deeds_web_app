/**
 * Streaming Embedding Service — AsyncGenerator-based embedding with progress events
 * Provides streaming progress for long-running batch operations, Float32→Uint8 quantization,
 * and Redis caching. Delegates actual embedding to embedding-client.ts.
 *
 * Usage:
 *   for await (const event of streamEmbedding('doc1', 'some text')) {
 *     console.log(event); // "[boot] Initializing...", "[embed] Generated 768-dim", etc.
 *   }
 */

import { generateSingleEmbedding, generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { getRedis } from '$lib/server/redis.js';
import { SERVER_EMBEDDING_MODEL, SERVER_EMBEDDING_DIMS } from '$lib/ai/model-ids.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CachedEmbedding {
	float32: number[];
	quantized: Uint8Array;
	model: string;
	cachedAt: number;
}

// ---------------------------------------------------------------------------
// Quantization
// ---------------------------------------------------------------------------

/**
 * Quantize Float32 array to Uint8 (min-max normalization to 0-255).
 * 4x compression: 768 floats (3072 bytes) → 768 bytes.
 */
export function quantizeFloat32ToUint8(float32: Float32Array | number[]): Uint8Array {
	const arr = float32 instanceof Float32Array ? float32 : new Float32Array(float32);
	let min = Infinity;
	let max = -Infinity;

	for (let i = 0; i < arr.length; i++) {
		if (arr[i] < min) min = arr[i];
		if (arr[i] > max) max = arr[i];
	}

	const range = max - min || 1; // prevent division by zero
	const quantized = new Uint8Array(arr.length);

	for (let i = 0; i < arr.length; i++) {
		quantized[i] = Math.round(((arr[i] - min) / range) * 255);
	}

	return quantized;
}

/**
 * Dequantize Uint8 back to Float32 (approximate, not lossless)
 */
export function dequantizeUint8ToFloat32(
	quantized: Uint8Array,
	min: number,
	max: number
): Float32Array {
	const range = max - min || 1;
	const float32 = new Float32Array(quantized.length);

	for (let i = 0; i < quantized.length; i++) {
		float32[i] = (quantized[i] / 255) * range + min;
	}

	return float32;
}

// ---------------------------------------------------------------------------
// Streaming Embedding (single document)
// ---------------------------------------------------------------------------

/**
 * Stream embedding generation with progress events.
 * Yields progress strings: [boot], [embed], [quant], [cache], [done]
 */
export async function* streamEmbedding(
	docId: string,
	text: string,
	model?: string
): AsyncGenerator<string> {
	const modelName = model ?? SERVER_EMBEDDING_MODEL;
	const start = Date.now();

	yield `[boot] Initializing embedding for doc ${docId} (model: ${modelName})`;

	// Check cache first
	const cached = await getCachedEmbedding(docId);
	if (cached) {
		yield `[cache] Cache hit for ${docId} (${cached.float32.length}-dim, cached ${Date.now() - cached.cachedAt}ms ago)`;
		yield `[done] Completed in ${Date.now() - start}ms (cached)`;
		return;
	}

	// Generate embedding
	yield `[embed] Generating ${SERVER_EMBEDDING_DIMS}-dim embedding...`;
	const embedding = await generateSingleEmbedding(text);

	if (!embedding || embedding.length === 0) {
		yield `[error] Failed to generate embedding for ${docId}`;
		return;
	}

	yield `[embed] Generated ${embedding.length}-dim vector`;

	// Quantize
	yield `[quant] Quantizing Float32 → Uint8 (${embedding.length * 4} → ${embedding.length} bytes)`;
	const quantized = quantizeFloat32ToUint8(embedding);

	// Cache in Redis
	yield `[cache] Storing in Redis cache...`;
	try {
		const redis = getRedis();
		const cacheData: CachedEmbedding = {
			float32: embedding,
			quantized: Array.from(quantized) as unknown as Uint8Array,
			model: modelName,
			cachedAt: Date.now()
		};
		await redis.set(
			`emb:${docId}`,
			JSON.stringify(cacheData),
			'EX',
			86400 // 24h TTL
		);
		yield `[cache] Cached successfully`;
	} catch {
		yield `[cache] Cache write failed (non-fatal)`;
	}

	yield `[done] Completed in ${Date.now() - start}ms`;
}

// ---------------------------------------------------------------------------
// Batch Streaming
// ---------------------------------------------------------------------------

/**
 * Stream batch embedding with per-item progress.
 * Yields progress for each item in sequence.
 */
export async function* streamBatchEmbeddings(
	items: Array<{ id: string; text: string }>,
	model?: string
): AsyncGenerator<string> {
	const total = items.length;
	const start = Date.now();

	yield `[batch] Starting batch embedding: ${total} items`;

	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		yield `[batch] Processing ${i + 1}/${total}: ${item.id}`;

		for await (const event of streamEmbedding(item.id, item.text, model)) {
			yield `  ${event}`;
		}
	}

	yield `[batch] Batch complete: ${total} items in ${Date.now() - start}ms`;
}

// ---------------------------------------------------------------------------
// Cache Operations
// ---------------------------------------------------------------------------

/**
 * Get cached embedding (both float32 and quantized versions)
 */
export async function getCachedEmbedding(docId: string): Promise<CachedEmbedding | null> {
	try {
		const redis = getRedis();
		const raw = await redis.get(`emb:${docId}`);
		if (!raw) return null;

		const parsed = JSON.parse(raw) as CachedEmbedding;

		// Validate dimensions
		if (!parsed.float32 || parsed.float32.length !== SERVER_EMBEDDING_DIMS) {
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}
