/**
 * Centralized utility to get the Ollama API endpoint.
 * Prioritizes Docker service names from environment variables,
 * with a localhost fallback for local development without Docker Compose.
 */
export function getOllamaEndpoint(): string {
 const defaultPort = 11434;
 const port = process.env.OLLAMA_PORT ? Number(process.env.OLLAMA_PORT) : defaultPort;
 return process.env.OLLAMA_URL || `http://localhost:${port}`;
}

/**
 * Utility to get the Ollama generation API endpoint.
 * This can be distinct from the general Ollama URL if specific generation services are used.
 */
export function getOllamaGenerationEndpoint(): string {
 return process.env.OLLAMA_GENERATION_URL || getOllamaEndpoint();
}

/**
 * Utility to get the Ollama embedding API endpoint.
 * This can be distinct from the general Ollama URL if specific embedding services are used.
 */
export function getOllamaEmbeddingEndpoint(): string {
 return process.env.OLLAMA_EMBEDDING_URL || getOllamaEndpoint();
}

/**
 * Utility to get specific Ollama API endpoints based on type.
 * @param type The type of Ollama API endpoint to retrieve (e.g., 'generate', 'delete', 'list', 'show').
 * @returns The full URL for the specified Ollama API endpoint.
 */
export function getOllamaApiEndpoint(
 type: 'generate' | 'delete' | 'list' | 'show' | string
): string {
 const base = getOllamaEndpoint(); // Get the base Ollama URL
 switch (type) {
 case 'delete':
 return `${base}/api/delete`;
 case 'list':
 return `${base}/api/tags`;
 case 'show':
 return `${base}/api/show`;
 default:
 return `${base}/api/generate`; // Default to generate if type is unknown
 }
}

