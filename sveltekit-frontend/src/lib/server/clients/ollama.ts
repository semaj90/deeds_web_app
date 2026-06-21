import { ENV } from '$lib/server/env.server.js';
import { getOllamaEndpoint as getChatEndpoint } from '$lib/server/utils/ollama-endpoint.js';

/**
 * Ollama client endpoint helper
 */
export function getOllamaEndpoint(): string {
	return getChatEndpoint();
}
