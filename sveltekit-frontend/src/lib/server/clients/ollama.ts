import { ENV } from '$lib/server/env.server.js';

/**
 * Ollama client endpoint helper
 */
export function getOllamaEndpoint(): string {
	return ENV.OLLAMA_BASE_URL;
}
