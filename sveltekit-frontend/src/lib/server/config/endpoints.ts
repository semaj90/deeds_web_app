/**
 * Centralized utility functions for retrieving service endpoints.
 * Delegates to ENV from env.server.ts for consistent URL resolution.
 */
import { ENV } from '$lib/server/env.server.js';

export function getOllamaEndpoint(): string {
	return ENV.OLLAMA_BASE_URL;
}

export function getQdrantEndpoint(): string {
	return ENV.QDRANT_URL;
}

export function getRedisUrl(): string {
	return ENV.REDIS_URL;
}

export function getLiteLLMEndpoint(): string {
	return ENV.LITELLM_URL;
}

export function isLiteLLMEnabled(): boolean {
	return ENV.LITELLM_ENABLED;
}
