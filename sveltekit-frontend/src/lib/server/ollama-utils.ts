// src/lib/server/ollama-utils.ts
import { OLLAMA_BASE_URL } from '$env/static/private';

/**
 * Returns the base URL for the Ollama service.
 * This centralizes the Ollama endpoint configuration.
 */
export function getOllamaEndpoint(): string {
    return OLLAMA_BASE_URL ?? 'http://localhost:11434';
}
