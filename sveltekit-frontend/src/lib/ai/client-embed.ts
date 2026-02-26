/**
 * Client-Side Embedding via ONNX — first real local inference target.
 *
 * Single forward pass → validate vector.length === 768 → cache in IndexedDB.
 * Uses embeddinggemma 300M QInt8 ONNX model from static/.
 *
 * Usage:
 *   import { embedText, isEmbeddingModelReady } from '$lib/ai/client-embed.js';
 *   const vector = await embedText('search query');
 *   // vector.length === 768
 */

import {
	CLIENT_EMBEDDING_ONNX_PATH,
	CLIENT_EMBEDDING_TOKENIZER_PATH,
	CLIENT_EMBEDDING_DIMS
} from './model-ids.js';
import { getOnnxSession, getProviderLabel, isSessionCached } from './onnx/session.js';
import { clientCache } from './client-cache.js';

let tokenizer: any = null;
let tokenizerLoading: Promise<any> | null = null;

/** Load the embedding tokenizer (memoized) */
async function ensureTokenizer(): Promise<any> {
	if (tokenizer) return tokenizer;
	if (tokenizerLoading) return tokenizerLoading;

	tokenizerLoading = (async () => {
		const transformers = await import('@huggingface/transformers');
		// Allow loading tokenizer from local static/ files
		transformers.env.allowLocalModels = true;
		transformers.env.allowRemoteModels = false;
		tokenizer = await transformers.AutoTokenizer.from_pretrained(
			CLIENT_EMBEDDING_TOKENIZER_PATH.replace('/tokenizer.json', ''),
			{ local_files_only: true }
		);
		return tokenizer;
	})();

	return tokenizerLoading;
}

/**
 * Generate a 768-dim embedding vector for the given text, client-side.
 *
 * Flow:
 *   1. Check IndexedDB cache → return if hit
 *   2. Tokenize with embeddinggemma tokenizer
 *   3. Run ONNX InferenceSession (WebGPU → WASM fallback)
 *   4. Mean-pool token embeddings → normalize → 768-dim vector
 *   5. Cache result in IndexedDB (7-day TTL)
 *
 * @param text - Input text to embed
 * @returns Float32 vector of length 768
 */
export async function embedText(text: string): Promise<number[]> {
	if (typeof window === 'undefined') {
		throw new Error('embedText() is browser-only');
	}

	// 1. Check cache
	const cached = await clientCache.getEmbedding(text);
	if (cached && cached.length === CLIENT_EMBEDDING_DIMS) {
		return cached;
	}

	// 2. Load model + tokenizer
	const [session, tok] = await Promise.all([
		getOnnxSession(CLIENT_EMBEDDING_ONNX_PATH),
		ensureTokenizer()
	]);

	// 3. Tokenize
	const encoded = tok(text, {
		return_tensors: 'np',
		padding: true,
		truncation: true,
		max_length: 512
	});

	// 4. Build ONNX tensors
	const { Tensor } = await import('onnxruntime-web');
	const inputIds = new Tensor(
		'int64',
		new BigInt64Array(Array.from(encoded.input_ids.data as number[], (v: number) => BigInt(v))),
		[1, encoded.input_ids.data.length]
	);
	const attentionMask = new Tensor(
		'int64',
		new BigInt64Array(Array.from(encoded.attention_mask.data as number[], (v: number) => BigInt(v))),
		[1, encoded.attention_mask.data.length]
	);

	// 5. Run inference
	const feeds: Record<string, any> = {
		input_ids: inputIds,
		attention_mask: attentionMask
	};

	// Some models also expect token_type_ids
	if (encoded.token_type_ids) {
		feeds.token_type_ids = new Tensor(
			'int64',
			new BigInt64Array(Array.from(encoded.token_type_ids.data as number[], (v: number) => BigInt(v))),
			[1, encoded.token_type_ids.data.length]
		);
	}

	const results = await session.run(feeds);

	// 6. Extract embeddings — try common output names
	const outputKey = results.last_hidden_state
		? 'last_hidden_state'
		: results.token_embeddings
			? 'token_embeddings'
			: Object.keys(results)[0];

	const outputData = results[outputKey].data as Float32Array;
	const seqLen = encoded.input_ids.data.length;
	const dims = CLIENT_EMBEDDING_DIMS;

	// 7. Mean pooling over sequence dimension (with attention mask)
	const maskData = encoded.attention_mask.data as number[];
	const pooled = new Float32Array(dims);
	let maskSum = 0;

	for (let t = 0; t < seqLen; t++) {
		if (maskData[t] === 0) continue;
		maskSum += 1;
		for (let d = 0; d < dims; d++) {
			pooled[d] += outputData[t * dims + d];
		}
	}

	if (maskSum > 0) {
		for (let d = 0; d < dims; d++) {
			pooled[d] /= maskSum;
		}
	}

	// 8. L2 normalize
	let norm = 0;
	for (let d = 0; d < dims; d++) {
		norm += pooled[d] * pooled[d];
	}
	norm = Math.sqrt(norm);
	if (norm > 0) {
		for (let d = 0; d < dims; d++) {
			pooled[d] /= norm;
		}
	}

	const vector = Array.from(pooled);

	// 9. Validate dimensions
	if (vector.length !== CLIENT_EMBEDDING_DIMS) {
		console.error(`[ClientEmbed] Expected ${CLIENT_EMBEDDING_DIMS} dims, got ${vector.length}`);
	}

	// 10. Cache in IndexedDB
	await clientCache.putEmbedding(text, vector);

	console.info(
		`[ClientEmbed] Generated ${dims}-dim embedding via ${getProviderLabel(CLIENT_EMBEDDING_ONNX_PATH)}`
	);

	return vector;
}

/** Check if the embedding model is loaded and ready */
export function isEmbeddingModelReady(): boolean {
	return isSessionCached(CLIENT_EMBEDDING_ONNX_PATH) && tokenizer !== null;
}

/** Preload the embedding model + tokenizer without running inference */
export async function preloadEmbeddingModel(): Promise<void> {
	await Promise.all([
		getOnnxSession(CLIENT_EMBEDDING_ONNX_PATH),
		ensureTokenizer()
	]);
	console.info('[ClientEmbed] Model + tokenizer preloaded');
}

/** Cosine similarity between two vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) return 0;
	let dot = 0, normA = 0, normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom > 0 ? dot / denom : 0;
}

/**
 * Numerically stable softmax — converts raw scores to probability distribution.
 * Ported from Go feature-vector-scorer.go — subtracts max(x) before exp() to
 * prevent floating-point overflow on large scores.
 *
 * @param scores - Raw score array
 * @returns Probability distribution summing to 1.0
 */
export function stableSoftmax(scores: number[]): number[] {
	if (scores.length === 0) return [];
	if (scores.length === 1) return [1.0];

	const max = Math.max(...scores);
	const exps = scores.map(s => Math.exp(s - max));
	const sum = exps.reduce((a, b) => a + b, 0);
	return sum > 0 ? exps.map(e => e / sum) : exps.map(() => 1 / scores.length);
}

/**
 * Batch cosine similarity — query vs N document vectors via GPU compute pipeline.
 * Falls back to CPU if WebGPU unavailable.
 *
 * @param query - 768-dim query embedding
 * @param documents - Array of 768-dim document embeddings
 * @returns Similarity scores + compute backend used
 */
export async function batchCosineSimilarity(
	query: number[],
	documents: number[][]
): Promise<{ scores: number[]; backend: string; durationMs: number }> {
	if (typeof window === 'undefined' || documents.length === 0) {
		return { scores: [], backend: 'none', durationMs: 0 };
	}

	const dim = CLIENT_EMBEDDING_DIMS;
	const queryF32 = new Float32Array(query);
	const docsF32 = new Float32Array(documents.length * dim);

	for (let i = 0; i < documents.length; i++) {
		for (let d = 0; d < dim; d++) {
			docsF32[i * dim + d] = documents[i][d] ?? 0;
		}
	}

	try {
		const { getGPUCompute } = await import('$lib/gpu/gpu-compute-pipeline.js');
		const gpu = await getGPUCompute();
		const result = await gpu.cosineSimilarity(queryF32, docsF32, documents.length);
		return {
			scores: Array.from(result.data),
			backend: result.backend,
			durationMs: result.durationMs
		};
	} catch {
		// Inline CPU fallback
		const scores = documents.map(doc => cosineSimilarity(query, doc));
		return { scores, backend: 'cpu-inline', durationMs: 0 };
	}
}

// ─── Playwright Test Hook ────────────────────────────────────────────────────
// Exposes window.__deedsClientInference in dev mode for e2e inference validation.

if (typeof window !== 'undefined') {
	const hook = {
		get ready() {
			return isEmbeddingModelReady();
		},
		embeddingDim: CLIENT_EMBEDDING_DIMS,
		async runEmbedding(text: string) {
			const start = performance.now();
			const vector = await embedText(text);
			const durationMs = Math.round(performance.now() - start);
			const backend = getProviderLabel(CLIENT_EMBEDDING_ONNX_PATH);
			return { vector, dim: vector.length, backend, durationMs };
		},
		async preload() {
			await preloadEmbeddingModel();
			return { ready: isEmbeddingModelReady(), backend: getProviderLabel(CLIENT_EMBEDDING_ONNX_PATH) };
		}
	};
	(window as any).__deedsClientInference = hook;
}
