/**
 * MARCO MiniLM Cross-Encoder Reranker
 * 
 * Provides pointwise scoring for retrieval candidates using 
 * the cross-encoder/ms-marco-MiniLM-L-12-v2 model.
 */

import { ENV } from '$lib/server/env.server.js';

export interface RerankPair {
	query: string;
	document: string;
}

export interface RerankScore {
	score: number;
}

/**
 * Reranks candidates using a Cross-Encoder model.
 * Usually runs via a sidecar inference service or a dedicated gRPC port.
 */
export async function rerankWithMarco(query: string, candidates: string[]): Promise<number[]> {
	if (candidates.length === 0) return [];

	try {
		// Implementation assuming a local inference API (e.g. TEI or custom Go bridge)
		const response = await fetch(`${ENV.RERANK_URL}/rerank`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query,
				documents: candidates,
				model: 'cross-encoder/ms-marco-MiniLM-L-12-v2'
			}),
			signal: AbortSignal.timeout(10000)
		});

		if (!response.ok) {
			console.error('[marco-reranker] Model request failed');
			return new Array(candidates.length).fill(0);
		}

		const data = await response.json() as { scores: number[] };
		return data.scores;
	} catch (error) {
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
