import { ENV } from '$lib/server/env.server.js';

export function getOllamaEndpoint(): string {
	return ENV.OLLAMA_BASE_URL;
}
