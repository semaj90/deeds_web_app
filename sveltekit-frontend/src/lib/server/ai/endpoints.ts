/**
 * AI endpoint helpers — re-exports canonical implementations.
 *
 * getOllamaEndpoint / getOllamaEmbeddingEndpoint / getOllamaGenerationEndpoint
 * → ollama.ts (canonical, Docker-aware)
 */
export {
  getOllamaEndpoint,
  getOllamaEmbeddingEndpoint,
  getOllamaGenerationEndpoint,
  getOllamaChatEndpoint,
} from '$lib/server/ollama.js';
