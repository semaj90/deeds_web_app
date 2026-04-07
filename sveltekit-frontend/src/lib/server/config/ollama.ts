/**
 * Ollama Configuration
 * Centralized endpoint management for Gemma models
 */
import { ENV } from '$lib/server/env.server.js';

export interface OllamaConfig {
	baseUrl: string;
	model: string;
	timeout: number;
}

const DEFAULT_OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const DEFAULT_MODEL = process.env?.OLLAMA_MODEL ?? 'gemma:7b';
const DEFAULT_TIMEOUT = 30000;

/**
 * Get Ollama endpoint configuration
 */
export function getOllamaEndpoint(): OllamaConfig {
	return {
		baseUrl: DEFAULT_OLLAMA_URL,
		model: DEFAULT_MODEL,
		timeout: DEFAULT_TIMEOUT
	};
}

/**
 * Get Ollama API URL
 */
export function getOllamaUrl(endpoint: string = '/api/generate'): string {
	const config = getOllamaEndpoint();
	return `${config.baseUrl}${endpoint}`;
}

/**
 * Check Ollama health
 */
export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const config = getOllamaEndpoint();
    const response = await fetch(`${config.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (error) {
    console.error('Ollama health check failed:', error);
    return false;
  }
}

/**
 * Generate embeddings using Ollama
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const config = getOllamaEndpoint();

  try {
    const response = await fetch(getOllamaUrl('/api/embeddings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: config.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('Embedding generation failed:', error);
    throw error;
  }
}

/**
 * Generate text using Ollama
 */
export async function generateText(
  prompt: string,
  options?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    numPredict?: number;
  }
): Promise<string> {
  const config = getOllamaEndpoint();

  try {
    const response = await fetch(getOllamaUrl('/api/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: config.model,
        prompt: prompt,
        stream: false,
        temperature: options?.temperature ?? 0.7,
        top_k: options?.topK ?? 40,
        top_p: options?.topP ?? 0.9,
        num_predict: options?.numPredict ?? 256,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error('Text generation failed:', error);
    throw error;
  }
}

/**
 * Stream text generation
 */
export async function* streamText(
  prompt: string,
  options?: {
    temperature?: number;
    topK?: number;
    topP?: number;
  }
): AsyncGenerator<string> {
  const config = getOllamaEndpoint();

  try {
    const response = await fetch(getOllamaUrl('/api/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: config.model,
        prompt: prompt,
        stream: true,
        temperature: options?.temperature ?? 0.7,
        top_k: options?.topK ?? 40,
        top_p: options?.topP ?? 0.9,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              yield data.response;
            }
          } catch (e) {
            // ignore parse errors for partial json
          }
        }
      }

      buffer = lines[lines.length - 1];
    }

    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);
        if (data.response) {
          yield data.response;
        }
      } catch (e) {
        // ignore
      }
    }
  } catch (error) {
    console.error('Stream generation failed:', error);
    throw error;
  }
}

