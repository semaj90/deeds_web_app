/**
 * Configured Cross-Encoder Reranker
 *
 * Provides pointwise scoring for retrieval candidates using
 * the Mixedbread reranker backend, with :8094 EmbeddingGemma 2 ONNX MRL fallback.
 */

import { ENV } from '$lib/server/env.server.js';
import { resolveRerankEndpoint } from './rerank-endpoint.js';

export interface RerankPair {
	query: string;
	document: string;
}

export interface RerankScore {
	score: number;
}

export type Eg2MrlDimension = 768 | 512 | 256 | 128;

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	const denom = Math.sqrt(na) * Math.sqrt(nb);
	return denom > 0 ? dot / denom : 0;
}

/**
 * Lightweight cosine reranker via :8094 EmbeddingGemma 2 ONNX MRL dims (768/512/256/128).
 * Note: latent256/latent128/latent64 bytea projections are separate trained/autoencoder spaces,
 * never sliced directly from MRL vectors.
 */
export async function rerankWithEg2Mrl8094(
	query: string,
	candidates: string[],
	dim: Eg2MrlDimension = 256,
): Promise<number[]> {
	if (candidates.length === 0) return [];
	const endpoint = (process.env.GEMMA2_ONNX_URL ?? 'http://127.0.0.1:8094').replace(/\/+$/, '');
	try {
		const res = await fetch(`${endpoint}/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ texts: [query, ...candidates], dims: [dim] }),
			signal: AbortSignal.timeout(10000),
		});
		if (!res.ok) return new Array(candidates.length).fill(0);
		const data = (await res.json()) as { embeddings?: Record<string, number[][]> };
		const vecs = data.embeddings?.[String(dim)];
		if (!Array.isArray(vecs) || vecs.length !== candidates.length + 1) {
			return new Array(candidates.length).fill(0);
		}
		const queryVec = vecs[0];
		return vecs.slice(1).map((docVec) => cosineSimilarity(queryVec, docVec));
	} catch {
		return new Array(candidates.length).fill(0);
	}
}

/**
 * Reranks candidates using a Cross-Encoder model.
 * Usually runs via a sidecar inference service or a dedicated gRPC port.
 * Falls back to :8094 EG2 ONNX MRL cosine reranking in live runtime when /rerank is unavailable.
 */
export async function rerankWithMarco(query: string, candidates: string[]): Promise<number[]> {
	if (candidates.length === 0) return [];
	const endpoint = resolveRerankEndpoint(ENV);
	if (!endpoint) {
		if (!process.env.VITEST || process.env.GEMMA2_ONNX_URL) {
			return rerankWithEg2Mrl8094(query, candidates, 256);
		}
		console.warn('[marco-reranker] Reranker endpoint unavailable');
		return new Array(candidates.length).fill(0);
	}

	try {
		const response = await fetch(`${endpoint}/rerank`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query,
				documents: candidates,
				model: 'mixedbread-ai/mxbai-rerank-base-v2',
			}),
			signal: AbortSignal.timeout(10000),
		});

		if (!response.ok) {
			if (!process.env.VITEST || process.env.GEMMA2_ONNX_URL) {
				return rerankWithEg2Mrl8094(query, candidates, 256);
			}
			console.error('[marco-reranker] Model request failed');
			return new Array(candidates.length).fill(0);
		}

		const data = (await response.json()) as { scores: number[] };
		return data.scores;
	} catch (error) {
		if (!process.env.VITEST || process.env.GEMMA2_ONNX_URL) {
			return rerankWithEg2Mrl8094(query, candidates, 256);
		}
		console.error('[marco-reranker] Execution failed:', error);
		return new Array(candidates.length).fill(0);
	}
}

/**
 * Scores a single query-document pair.
 */
export async function scorePair(query: string, document: string): Promise<number> {
	const scores = await rerankWithMarco(query, [document]);
	return scores[0] ?? 0;
}
