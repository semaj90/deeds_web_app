/**
 * Ollama embedding configuration and compatibility shim.
 *
 * Ollama is kept here for embeddings only. Chat/generation lives in
 * config/llama-server.ts.
 */
import { ENV } from '$lib/server/env.server.js';
import { getOllamaEmbeddingEndpoint } from '$lib/server/utils/ollama-endpoint.js';
export {
  generateText,
  streamText,
  checkLlamaServerHealth as checkOllamaHealth,
  getLlamaServerEndpoint as getOllamaEndpoint,
  getLlamaServerUrl as getOllamaUrl,
} from './llama-server.js';

export interface OllamaConfig {
	baseUrl: string;
	model: string;
	timeout: number;
}

const DEFAULT_EMBED_OLLAMA_URL = getOllamaEmbeddingEndpoint();
const DEFAULT_MODEL = process.env?.OLLAMA_MODEL ?? 'gemma:7b';
const DEFAULT_TIMEOUT = 30000;

export function getOllamaEmbeddingConfig(): OllamaConfig {
	return {
		baseUrl: DEFAULT_EMBED_OLLAMA_URL,
		model: process.env?.OLLAMA_EMBED_MODEL || 'embeddinggemma:latest',
		timeout: DEFAULT_TIMEOUT
	};
}

/**
 * Generate embeddings using Ollama.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const config = getOllamaEmbeddingConfig();

  try {
    const response = await fetch(`${config.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: config.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding endpoint error: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('Embedding generation failed:', error);
    throw error;
  }
}

