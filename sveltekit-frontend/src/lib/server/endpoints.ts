/**
 * Server endpoint helpers — re-exports canonical implementations.
 *
 * getOllamaEndpoint → ollama.ts (canonical, Docker-aware)
 */
export { getOllamaEndpoint } from '$lib/server/ollama.js';

/**
 * Docker-first endpoint helpers for server code
 */
export function getEnvUrl(envName: string, dockerHost: string, localFallback?: string): string {
	return process.env[envName] || dockerHost || (localFallback ?? '');
}

export function getEnhancedRagEndpoint(): string {
	// audit:ignore-localhost — third-tier dev fallback after ENV → Docker hostname
	return getEnvUrl('ENHANCED_RAG_URL', 'http://enhanced-rag:8094', 'http://localhost:8094');
}
