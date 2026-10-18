/**
 * Client-side embedding access (server-backed).
 *
 * The browser used to run the QInt8 `model.onnx` locally, but that graph exposes only `last_hidden_state`
 * and this module skipped EmbeddingGemma's two Dense projection layers, so its vectors were NOT in the
 * `embeddinggemma:latest` space (cosine ~0 against stored vectors; ~0.59 even with Dense added).
 * See openspec/changes/legal-corpus-california-codes/tasks.md ONNX-ROOTCAUSE-01.
 * Vectors are therefore requested from the canonical server route, POST /api/embed, and cached per
 * browser under a versioned key so entries written by the old ONNX path are never served.
 *
 * Usage:
 *   import { embedText, isEmbeddingModelReady } from '$lib/ai/client-embed.js';
 *   const vector = await embedText('search query');
 *   // vector.length === 768
 */

import { CLIENT_EMBEDDING_DIMS } from './model-ids.js';
import { clientCache } from './client-cache.js';

const EMBED_ROUTE = '/api/embed';
/** Bump when the vector source changes; old cache entries are keyed differently and are ignored. */
const EMBED_CACHE_NAMESPACE = 'server-embed-v1::';
const EMBED_TIMEOUT_MS = 30_000;
const BACKEND_LABEL = 'server:/api/embed';

/**
 * Generate a 768-dim embedding vector for the given text via the canonical server route.
 *
 * Flow:
 *   1. Check IndexedDB cache (versioned key) -> return if hit
 *   2. POST /api/embed {text, model:'embeddinggemma'}
 *   3. Fail closed on any non-200, wrong dimension, or non-finite value (no local fallback vector)
 *   4. Cache result in IndexedDB (7-day TTL)
 *
 * @param text - Input text to embed
 * @returns Float32Array vector of length 768
 */
export async function embedText(text: string): Promise<Float32Array> {
	if (typeof window === 'undefined') {
		throw new Error('embedText() is browser-only');
	}
	if (!text || !text.trim()) {
		throw new Error('CLIENT_EMBED_EMPTY_TEXT');
	}

	const cacheKey = `${EMBED_CACHE_NAMESPACE}${text}`;
	const cached = await clientCache.getEmbedding(cacheKey);
	if (cached && cached.length === CLIENT_EMBEDDING_DIMS) {
		return cached instanceof Float32Array ? cached : new Float32Array(cached);
	}

	const response = await fetch(EMBED_ROUTE, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text, model: 'embeddinggemma' }),
		signal: AbortSignal.timeout(EMBED_TIMEOUT_MS)
	});
	if (!response.ok) {
		throw new Error(`CLIENT_EMBED_SERVER_${response.status}`);
	}
	const data = (await response.json()) as { embedding?: unknown };
	const raw = data?.embedding;
	if (
		!Array.isArray(raw) ||
		raw.length !== CLIENT_EMBEDDING_DIMS ||
		!raw.every((v) => typeof v === 'number' && Number.isFinite(v))
	) {
		throw new Error('CLIENT_EMBED_INVALID_VECTOR');
	}

	const vector = Float32Array.from(raw as number[]);
	await clientCache.putEmbedding(cacheKey, Array.from(vector));
	return vector;
}

/** The server route needs no local model; ready whenever the browser reports it is online. */
export function isEmbeddingModelReady(): boolean {
	return typeof navigator === 'undefined' ? false : navigator.onLine !== false;
}

/** Kept for API compatibility: there is no local model or tokenizer to preload any more. */
export async function preloadEmbeddingModel(): Promise<void> {
	console.info('[ClientEmbed] Server-backed embeddings; nothing to preload');
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
			const backend = BACKEND_LABEL;
			return { vector, dim: vector.length, backend, durationMs };
		},
		async preload() {
			await preloadEmbeddingModel();
			return { ready: isEmbeddingModelReady(), backend: BACKEND_LABEL };
		}
	};
	(window as any).__deedsClientInference = hook;
}
