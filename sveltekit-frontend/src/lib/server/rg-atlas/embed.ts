/**
 * Stage 6 — Batched canonical semantic_768 embeddings through the shared provider.
 * Cache access remains behind the provider client's immutable-artifact gate.
 */

import { ENV } from '$lib/server/env.server.js';
import { SERVER_EMBEDDING_MODEL } from '$lib/ai/model-ids.js';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
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
	if (model !== SERVER_EMBEDDING_MODEL) {
		throw new Error('RG_ATLAS_EMBEDDING_MODEL_MUST_BE_CANONICAL_SEMANTIC_768');
	}
	if (inputs.length === 0) return [];

	// P0: Validate backend on first call (prevent silent provider-URL mismatch)
	if (!backendValidated) {
		const resolution = resolveEmbeddingBackend(model, {
			configuredProvider: ENV.EMBEDDING_PROVIDER,
			configuredBaseUrl: ENV.EMBEDDING_BASE_URL,
			fallbackBaseUrl: ENV.LLAMA_SERVER_URL ?? ENV.OLLAMA_EMBED_BASE_URL ?? ENV.OLLAMA_BASE_URL,
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

	const generated = await generateEmbeddings(inputs);
	return generated.vectors;
}
