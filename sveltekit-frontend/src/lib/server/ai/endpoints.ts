/**
 * AI endpoint helpers — re-exports canonical implementations.
 *
 * getOllamaEndpoint / getOllamaEmbeddingEndpoint / getLlamaGenerationEndpoint
 * → ollama.ts (canonical, Docker-aware)
 */
export {
  getOllamaEndpoint,
  getOllamaEmbeddingEndpoint,
  getLlamaGenerationEndpoint,
  getLlamaChatEndpoint,
} from '$lib/server/ollama.js';
