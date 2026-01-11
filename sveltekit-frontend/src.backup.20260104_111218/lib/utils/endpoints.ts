/**
 * Returns the Ollama API endpoint, prioritizing the process.env.OLLAMA_URL environment variable
 * and falling back to a default localhost address.
 */
export function getOllamaEndpoint(): string {
 // Prefer Docker service hostname if available, otherwise fallback to localhost for dev
 return process.env.OLLAMA_URL || 'http://localhost:11434';
}
