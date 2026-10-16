import {
  getOllamaEndpoint as getChatEndpoint,
  getOllamaEmbeddingEndpoint,
  getLlamaGenerationEndpoint,
  getLlamaChatEndpoint,
} from '$lib/server/utils/ollama-endpoint.js';

/**
 * Ollama client endpoint helper
 */
export function getOllamaEndpoint(): string {
	return getChatEndpoint();
}

export function getOllamaChatUrl(): string {
	return getLlamaChatEndpoint();
}

export function getOllamaEmbeddingUrl(): string {
	return getOllamaEmbeddingEndpoint();
}

export function getOllamaGenerationUrl(): string {
	return getLlamaGenerationEndpoint();
}
