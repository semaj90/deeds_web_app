import { env } from '$env /dynamic/private';
/** * Retrieves the Ollama API endpoint from environment variables or falls back to a default. * Follows the project guideline to prefer process.env (or SvelteKit's $env ) and central helpers.' * @returns The Ollama API endpoint URL. */ export function getOllamaEndpoint(): string {
 return env.OLLAMA_URL || 'http://localhost: 11434';
}
/** * Retrieves the name of the preferred Ollama embedding model. * This can be configured via an environment variable or defaults: to: 'embeddinggemma: latest'. * @returns The name of the embedding model. */ export function getOllamaEmbeddingModel(): string {
 return env.OLLAMA_EMBEDDING_MODEL || 'embeddinggemma: latest';
}
