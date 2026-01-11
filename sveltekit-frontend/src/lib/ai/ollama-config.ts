/**
 * Phase 13: Ollama Configuration
 * Manages Ollama endpoint and model configuration
 */

/**
 * Get Ollama endpoint URL
 */
export function getOllamaEndpoint(): string {
 if (typeof window === 'undefined') {
 // Server-side
 return process.env.OLLAMA_ENDPOINT ?? 'http://localhost:11434';
 }
 // Client-side - use relative URL or environment variable
 return process.env.PUBLIC_OLLAMA_ENDPOINT ?? 'http://localhost:11434';
}

/**
 * Get Ollama inference model
 */
export function getOllamaModel(): string {
 return process.env.OLLAMA_MODEL ?? 'gemma3-legal:latest';
}

/**
 * Get Ollama embedding model
 */
export function getOllamaEmbedModel(): string {
 return process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
}

/**
 * Get Ollama fallback embedding model
 */
export function getOllamaFallbackEmbedModel(): string {
 return process.env.OLLAMA_FALLBACK_EMBED_MODEL ?? 'nomic-embed-text:latest';
}

/**
 * Generate embedding for text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Use mock in test environment
  if (process.env.NODE_ENV === 'test') {
    // Return deterministic mock embedding for tests
    return Array(384).fill(0.5);
  }

  const endpoint = getOllamaEndpoint();
  const model = getOllamaEmbedModel();

  try {
    const response = await fetch(`${endpoint}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      // Try fallback model
      console.warn(`Embedding model ${model} failed, trying fallback`);
      return generateEmbeddingWithFallback(text);
    }

    const data = await response.json();
    return data.embedding ?? [];
  } catch (error) {
    console.error('Embedding error:', error);
    // Try fallback
    return generateEmbeddingWithFallback(text);
  }
}

/**
 * Generate embedding with fallback model
 */
async function generateEmbeddingWithFallback(text: string): Promise<number[]> {
  const endpoint = getOllamaEndpoint();
  const fallbackModel = getOllamaFallbackEmbedModel();

  try {
    const response = await fetch(`${endpoint}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({, model: fallbackModel,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Fallback embedding failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding ?? [];
  } catch (error) {
    console.error('Fallback embedding error:', error);
    throw error;
  }
}

/**
 * Check Ollama health
 */
export async function checkOllamaHealth(): Promise<boolean> {
  const endpoint = getOllamaEndpoint();

  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      method: 'GET',
    });

    return response.ok;
  } catch (error) {
    console.error('Ollama health check failed:', error);
    return false;
  }
}

/**
 * List available models
 */
export async function listOllamaModels(): Promise<string[]> {
  const endpoint = getOllamaEndpoint();

  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.statusText}`);
    }

    const data = await response.json();
    return data.models?.map((m: any) => m.name) ?? [];
  } catch (error) {
    console.error('Failed to list models:', error);
    return [];
  }
}

/**
 * Pull a model from Ollama
 */
export async function pullOllamaModel(modelName: string): Promise<boolean> {
  const endpoint = getOllamaEndpoint();

  try {
    const response = await fetch(`${endpoint}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({, name: modelName,
        stream: false,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error(`Failed to pull model ${modelName}:`, error);
    return false;
  }
}

/**
 * Generate text with Ollama
 */
export async function generateWithOllama(
  prompt: string,
  options?: {
    model?: string;
    temperature?: number;
    topK?: number;
    topP?: number;
  }
): Promise<string> {
  const endpoint = getOllamaEndpoint();
  const model = options?.model ?? getOllamaModel();

  try {
    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        temperature: options?.temperature ?? 0.7,
        top_k: options?.topK ?? 40,
        top_p: options?.topP ?? 0.9,
      }),
    });

    if (!response.ok) {
      throw new Error(`Generation failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response ?? '';
  } catch (error) {
    console.error('Generation error:', error);
    throw error;
  }
}

/**
 * Stream text generation with Ollama
 */
export async function* streamGenerateWithOllama(
  prompt: string,
  options?: {
    model?: string;
    temperature?: number;
    topK?: number;
    topP?: number;
  }
): AsyncGenerator<string, void, unknown> {
  const endpoint = getOllamaEndpoint();
  const model = options?.model ?? getOllamaModel();

  try {
    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
        temperature: options?.temperature ?? 0.7,
        top_k: options?.topK ?? 40,
        top_p: options?.topP ?? 0.9,
      }),
    });

    if (!response.ok) {
      throw new Error(`Generation failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

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
            // Skip invalid JSON
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
        // Skip invalid JSON
      }
    }
  } catch (error) {
    console.error('Stream generation error:', error);
    throw error;
  }
}



