/**
 * Stage 6 — Batched Ollama /api/embed with Redis cache
 * Reuses embeddingCacheService for L1 exact-match persistence.
 */

import { ENV } from '$lib/server/env.server.js';
import { embeddingCacheService } from '$lib/server/embedding-cache-service.js';

/**
 * Batched embedding generator.
 * @param inputs Texts to embed
 * @param model Model name (default: embeddinggemma:latest)
 */
export async function getBatchedEmbeddings(
	inputs: string[],
	model: string = 'embeddinggemma:latest'
): Promise<number[][]> {
	const results: number[][] = new Array(inputs.length);
	const misses: { text: string; index: number }[] = [];

	// 1. Check Redis cache for each input
	for (let i = 0; i < inputs.length; i++) {
		const cached = await embeddingCacheService.getEmbedding(inputs[i], model);
		if (cached) {
			results[i] = cached;
		} else {
			misses.push({ text: inputs[i], index: i });
		}
	}

	if (misses.length === 0) return results;

	// 2. Batch call Ollama for misses
	// Note: Ollama /api/embed supports multiple inputs in one call
	try {
		const response = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				input: misses.map(m => m.text),
			}),
			signal: AbortSignal.timeout(60_000)
		});

		if (!response.ok) {
			throw new Error(`Ollama embed failed: ${response.status}`);
		}

		const data = await response.json() as { embeddings: number[][] };
		
		// 3. Update cache and populate results
		for (let i = 0; i < misses.length; i++) {
			const emb = data.embeddings[i];
			if (emb) {
				results[misses[i].index] = emb;
				// Background cache update
				void embeddingCacheService.cacheEmbedding(misses[i].text, emb, model);
			}
		}
	} catch (err) {
		console.error('[rg-atlas-embed] Error:', err);
		// Fill misses with zero vectors or throw? 
		// For now, return what we have (nulls will be filtered by downstream)
	}

	return results;
}
