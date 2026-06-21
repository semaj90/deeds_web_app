import { ENV } from '$lib/server/env.server.js';

export function getOllamaEndpoint(): string {
	return ENV.TURBOQUANT_URL ?? ENV.TURBOQUANT_BASE_URL ?? ENV.LLAMA_SERVER_URL ?? ENV.OLLAMA_BASE_URL;
}




