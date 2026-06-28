/**
 * Server endpoint helpers — re-exports canonical implementations.
 *
 * getOllamaEndpoint / getOllamaEmbeddingEndpoint / getOllamaGenerationEndpoint
 * → ollama.ts (canonical, Docker-aware)
 */
import { ENV } from '$lib/server/env.server.js';

export {
  getOllamaEndpoint,
  getOllamaEmbeddingEndpoint,
  getOllamaGenerationEndpoint,
  getOllamaChatEndpoint,
} from '$lib/server/ollama.js';

/**
 * Docker-first endpoint helpers for server code
 */
export function getEnvUrl(envName: string, dockerHost: string, localFallback?: string): string {
	return process.env[envName] || dockerHost || (localFallback ?? '');
}

export function getEnhancedRagEndpoint(): string {
	// third-tier dev fallback after ENV → Docker hostname
	return ENV.ENHANCED_RAG_URL || getEnvUrl('ENHANCED_RAG_URL', 'http://enhanced-rag:8094');
}
