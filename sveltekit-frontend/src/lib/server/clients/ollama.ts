import {
  getOllamaEndpoint as getChatEndpoint,
  getOllamaEmbeddingEndpoint,
  getOllamaGenerationEndpoint,
  getOllamaChatEndpoint,
} from '$lib/server/utils/ollama-endpoint.js';

/**
 * Ollama client endpoint helper
 */
export function getOllamaEndpoint(): string {
	return getChatEndpoint();
}

export function getOllamaChatUrl(): string {
	return getOllamaChatEndpoint();
}

export function getOllamaEmbeddingUrl(): string {
	return getOllamaEmbeddingEndpoint();
}

export function getOllamaGenerationUrl(): string {
	return getOllamaGenerationEndpoint();
}
