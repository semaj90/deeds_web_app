/**
 * Stage 6 — Batched Ollama /api/embed with Redis cache
 * Reuses embeddingCacheService for L1 exact-match persistence.
 * Backend validation wired via fingerprintBackend on module init.
 */

import { ENV } from '$lib/server/env.server.js';
import { embeddingCacheService } from '$lib/server/embedding-cache-service.js';
import {
	validateResolvedBackend,
	resolveEmbeddingBackend,
	type ResolutionValidationError,
} from '$lib/server/embedding/embedding-backend-resolution.js';

let backendValidated = false;
let backendValidationError: ResolutionValidationError[] | null = null;

/**
 * Batched embedding generator.
 * Validates backend fingerprint on first call; fails fast on provider-URL mismatch.
 * @param inputs Texts to embed
 * @param model Model name (default: embeddinggemma:latest)
 */
export async function getBatchedEmbeddings(
	inputs: string[],
	model: string = 'embeddinggemma:latest'
): Promise<number[][]> {
	// P0: Validate backend on first call (prevent silent provider-URL mismatch)
	if (!backendValidated) {
		const resolution = resolveEmbeddingBackend(model, {
			configuredProvider: ENV.EMBEDDING_PROVIDER,
			configuredBaseUrl: ENV.EMBEDDING_BASE_URL,
			fallbackBaseUrl: ENV.OLLAMA_BASE_URL,
		});

		const validation = await validateResolvedBackend(resolution.provider, resolution.baseUrl);
		backendValidated = true;
		backendValidationError = validation.errors.length > 0 ? validation.errors : null;

		if (!validation.valid) {
			const errorSummary = validation.errors.join(', ');
			console.error(
				`[embed] Backend validation failed: ${errorSummary}`,
				`(provider=${resolution.provider}, url=${resolution.baseUrl})`,
				`detected=${validation.fingerprint.isOllama ? 'ollama' : validation.fingerprint.isLlamaServer ? 'llama-server' : 'unknown'}`
			);
			throw new Error(
				`Embedding backend validation failed: ${errorSummary}. ` +
					`Configured: ${resolution.provider} @ ${resolution.baseUrl}. ` +
					`Please verify EMBEDDING_PROVIDER and EMBEDDING_BASE_URL environment variables.`
			);
		}

		console.log(
			`[embed] Backend validation passed (provider=${resolution.provider}, ` +
				`embeddings_supported=${validation.fingerprint.supportsEmbeddings})`
		);
	}

	// If validation failed on a prior call, throw immediately
	if (backendValidationError !== null) {
		throw new Error(
			`Embedding backend validation failed on startup. ` +
				`Errors: ${backendValidationError.join(', ')}. ` +
				`Restart required after fixing environment variables.`
		);
	}

	const results = new Array<number[] | null>(inputs.length).fill(null);
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

	if (misses.length === 0) return results as number[][];

	// 2. Batch call Ollama for misses
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
			throw new Error(`Ollama embed failed: ${response.status} ${response.statusText}`);
		}

		const data = await response.json() as { embeddings?: unknown };

		// Validate response structure
		if (!Array.isArray(data.embeddings)) {
			throw new Error(`Invalid Ollama response: embeddings is not an array`);
		}

		if (data.embeddings.length !== misses.length) {
			throw new Error(
				`Ollama response mismatch: expected ${misses.length} embeddings, got ${data.embeddings.length}`
			);
		}

		// 3. Populate results and update cache
		for (let i = 0; i < misses.length; i++) {
			const emb = data.embeddings[i];

			if (!Array.isArray(emb) || emb.length === 0) {
				throw new Error(`Invalid embedding at index ${i}: expected non-empty array, got ${typeof emb}`);
			}

			const embedding = emb as number[];
			results[misses[i].index] = embedding;
			void embeddingCacheService.cacheEmbedding(misses[i].text, embedding, model);
		}
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		console.error(`[rg-atlas-embed] Failed to embed ${misses.length} texts: ${errorMsg}`);
		throw new Error(`Embedding service error: ${errorMsg}`);
	}

	return results as number[][];
}
