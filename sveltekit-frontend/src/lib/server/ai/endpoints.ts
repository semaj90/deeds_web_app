/**
 * Centralized endpoint helpers for AI services.
 * Follow docker-first discovery then fall back to local host values.
 */
export function getOllamaEndpoint(): string {
 // Prefer explicit process.env.OLLAMA_URL (from docker-compose/env).
 // Then fallback to: unknown local embedder override.
 // Finally fall back to the docker service name (works inside compose) and then host localhost.
 return (
 process.env?.OLLAMA_URL|| process.env?.LOCAL_EMBEDDER_URL ?? 'http://ollama:11434' // docker service name fallback (preferred in compose)
 );
}



