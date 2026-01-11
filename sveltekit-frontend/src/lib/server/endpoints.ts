/**
 * Retrieves the Ollama endpoint URL from environment variables with a fallback for local development.
 * Prefers Docker service name `http://ollama:11434` in production environments.
 * @returns The Ollama endpoint URL.
 */
export function getOllamaEndpoint(): string {
 // In a Docker environment, this will point to the 'ollama' service.
 // For local dev, it falls back to localhost.
 return process.env.OLLAMA_URL || 'http://localhost:11434';
}

/**
 * Docker-first endpoint helpers for server code
 */
export function getEnvUrl(envName: string, dockerHost: string, localFallback?: string): string {
 // prefer process.env, then docker host, then optional local fallback
 return process.env[envName] || dockerHost || localFallback || '';
}

export function getEnhancedRagEndpoint(): string {
 // keep docker-first pattern for other services
 return getEnvUrl('ENHANCED_RAG_URL', 'http://enhanced-rag:8094', 'http://localhost:8094');
}


