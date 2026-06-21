/**
 * Centralized utility to get the Ollama API endpoint.
 * Prioritizes the process.env.OLLAMA_URL environment variable for Docker/production,
 * and falls back to the canonical server ENV default.
 */

import '$lib/server/env.server.js';

export {
  getOllamaEndpoint,
  getOllamaEmbeddingEndpoint,
  getOllamaGenerationEndpoint,
  getOllamaApiEndpoint,
} from '$lib/utils/ollama-endpoint.js';
