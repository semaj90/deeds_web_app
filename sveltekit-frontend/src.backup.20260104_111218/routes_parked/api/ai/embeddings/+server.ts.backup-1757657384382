/**
 * AI Embeddings API - Generate embeddings using multiple backends
 * Supports Ollama, vLLM, and fallback services for vector generation
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ollamaConfig } from '$lib/services/ollama-config-service.js';
import { ENV_CONFIG } from '$lib/config/environment.js';

const VLLM_ENDPOINT = process.env.VLLM_ENDPOINT || 'http://localhost:8000/v1';

interface EmbeddingRequest {
  text: string;
  model?: string;
  dimensions?: number;
}

interface EmbeddingResponse {
  embedding: number[];
  model: string;
  backend: string;
  dimensions: number;
  processingTime: number;
}

/**
 * Generate embeddings using available AI backends
 */
export const POST: RequestHandler = async ({ request }) => {
  const startTime = performance.now();

  try {
    const body: EmbeddingRequest = await request.json();

    if (!body.text) {
      return json({ error: 'Text is required' }, { status: 400 });
    }

    const text = body.text.trim();
    const model = body.model || 'nomic-embed-text';
    const targetDimensions = body.dimensions || 768;

    // Try backends in order of preference
    const backends = ['ollama', 'vllm', 'fallback'];

    for (const backend of backends) {
      try {
        const result = await generateEmbedding(text, model, backend, targetDimensions);
        if (result) {
          const processingTime = performance.now() - startTime;
          return json({
            embedding: result.embedding,
            model: result.model,
            backend: result.backend,
            dimensions: result.embedding.length,
            processingTime: Math.round(processingTime),
          } as EmbeddingResponse);
        }
      } catch (error) {
        console.error(`❌ ${backend} embedding failed:`, error);
        // Continue to next backend
      }
    }

    return json({ error: 'All embedding backends unavailable' }, { status: 503 });
  } catch (error) {
    console.error('Embedding API error:', error);
    return json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
};

/**
 * Get embedding backend health status
 */
export const GET: RequestHandler = async () => {
  const health = {
    ollama: await checkOllamaHealth(),
    vllm: await checkVLLMHealth(),
    timestamp: Date.now(),
  };

  return json(health);
};

/**
 * Generate embedding using specific backend
 */
async function generateEmbedding(
  text: string,
  model: string,
  backend: string,
  targetDimensions: number
): Promise<{ embedding: number[]; model: string; backend: string } | null> {
  switch (backend) {
    case 'ollama':
      return await generateOllamaEmbedding(text, model);

    case 'vllm':
      return await generateVLLMEmbedding(text, model);

    case 'fallback':
      return await generateFallbackEmbedding(text, targetDimensions);

    default:
      return null;
  }
}

/**
 * Generate embedding using Ollama
 */
async function generateOllamaEmbedding(text: string, model: string) {
  try {
    const response = await fetch(`${ollamaConfig.getBaseUrl()}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: text,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Ollama responded with ${response.status}`);
    }

    const data = await response.json();

    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error('Invalid embedding format from Ollama');
    }

    return {
      embedding: data.embedding,
      model,
      backend: 'ollama',
    };
  } catch (error) {
    console.error('Ollama embedding error:', error);
    throw error;
  }
}

/**
 * Generate embedding using vLLM (OpenAI-compatible)
 */
async function generateVLLMEmbedding(text: string, model: string) {
  try {
    const response = await fetch(`${VLLM_ENDPOINT}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'sentence-transformers/all-MiniLM-L6-v2',
        input: text,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`vLLM responded with ${response.status}`);
    }

    const data = await response.json();

    if (!data.data?.[0]?.embedding) {
      throw new Error('Invalid embedding format from vLLM');
    }

    return {
      embedding: data.data[0].embedding,
      model: data.model || model,
      backend: 'vllm',
    };
  } catch (error) {
    console.error('vLLM embedding error:', error);
    throw error;
  }
}

/**
 * Generate fallback embedding using simple text analysis
 * This is a basic implementation - in production you'd use a proper embedding model
 */
async function generateFallbackEmbedding(text: string, dimensions: number) {
  try {
    // Simple bag-of-words + TF-IDF approach for fallback
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w: string) => w.length > 2);

    // Create a basic embedding based on text features
    const embedding = new Array(dimensions).fill(0);

    // Hash-based feature extraction
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const hash = simpleHash(word);

      for (let j = 0; j < dimensions; j++) {
        const feature = (hash + j) % dimensions;
        embedding[feature] += 1.0 / Math.sqrt(words.length);
      }
    }

    // Normalize the vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    // Add some text-specific features
    const textLength = text.length;
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
    const uniqueWords = new Set(words).size;

    // Incorporate these features into the embedding
    if (dimensions > 10) {
      embedding[0] = Math.tanh(textLength / 1000); // Text length feature
      embedding[1] = Math.tanh(avgWordLength / 10); // Avg word length feature
      embedding[2] = Math.tanh(uniqueWords / words.length); // Vocabulary diversity
    }

    return {
      embedding,
      model: 'fallback-tfidf',
      backend: 'fallback',
    };
  } catch (error) {
    console.error('Fallback embedding error:', error);
    throw error;
  }
}

/**
 * Simple hash function for consistent word hashing
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Check Ollama health
 */
async function checkOllamaHealth(): Promise<{ healthy: boolean; models?: string[]; error?: string; hasEmbeddingModel?: boolean }> {
  try {
    const response = await fetch(`${ollamaConfig.getBaseUrl()}/api/tags`, {
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const data = await response.json();
      const models = data.models?.map((m: any) => m.name) || [];
      const hasEmbeddingModel = models.some(
        (name: string) =>
          name.includes('nomic-embed') || name.includes('embed') || name.includes('sentence')
      );

      return {
        healthy: true,
        models: models,
        hasEmbeddingModel
      };
    } else {
      return { healthy: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Check vLLM health
 */
async function checkVLLMHealth(): Promise<{ healthy: boolean; models?: string[]; error?: string }> {
  try {
    const response = await fetch(`${VLLM_ENDPOINT}/models`, {
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const data = await response.json();
      const models = data.data?.map((m: any) => m.id) || [];

      return {
        healthy: true,
        models
      };
    } else {
      return { healthy: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}