import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

// TODO: Add Triton Inference Server integration for production embedding serving
// TODO: Add nomic-embed-text fallback via Ollama (ollama pull nomic-embed-text)
// TODO: Wire up redis-orchestrator-middleware once cache layer is stable
// TODO: Redis optimization tensor analysis → Docker containers → Qdrant tagged → pgvector mirrored
// TODO: IndexedDB + Loki.js client-side caching for embedding results

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

interface EmbedRequest {
  text: string;
  model?: 'embeddinggemma' | 'nomic' | 'mock';
  dimensions?: number;
}

interface EmbedResponse {
  embedding: number[];
  model: string;
  dimensions: number;
  tokens?: number;
}

/**
 * Generate embedding via Ollama (embeddinggemma:latest primary, nomic-embed-text fallback)
 */
async function getOllamaEmbedding(
  text: string,
  model: string = 'embeddinggemma:latest'
): Promise<{ embedding: number[] }> {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
  });

  if (!response.ok) {
    throw new Error(`Ollama embedding error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return { embedding: Array.isArray(data.embedding) ? data.embedding : [] };
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { text, model = 'embeddinggemma', dimensions }: EmbedRequest = await request.json();

    if (!text || typeof text !== 'string') {
      return json({ error: 'Text is required and must be a string' }, { status: 400 });
    }

    if (text.length > 50000) {
      return json({ error: 'Text too long. Maximum 50,000 characters.' }, { status: 400 });
    }

    let result: EmbedResponse;

    switch (model) {
      case 'embeddinggemma': {
        const { embedding } = await getOllamaEmbedding(text, 'embeddinggemma:latest');
        result = { embedding, model: 'embeddinggemma:latest', dimensions: embedding.length };
        break;
      }
      case 'nomic': {
        const { embedding } = await getOllamaEmbedding(text, 'nomic-embed-text:latest');
        result = { embedding, model: 'nomic-embed-text:latest', dimensions: embedding.length };
        break;
      }
      case 'mock': {
        const targetDim = dimensions || 768;
        const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const embedding = Array.from(
          { length: targetDim },
          (_, i) => Math.sin((hash + i) / 100) * 0.5
        );
        result = { embedding, model: 'mock-embeddings', dimensions: targetDim, tokens: text.split(' ').length };
        break;
      }
      default:
        return json({ error: `Unsupported model: ${model}. Use 'embeddinggemma', 'nomic', or 'mock'` }, { status: 400 });
    }

    if (dimensions && dimensions < result.embedding.length) {
      result.embedding = result.embedding.slice(0, dimensions);
      result.dimensions = dimensions;
    }

    return json(result);
  } catch (error: unknown) {
    console.error('Embedding error:', error);
    return json({ error: 'Failed to generate embedding' }, { status: 500 });
  }
};

export const GET: RequestHandler = async () => {
  return json({
    message: 'Embedding API endpoint',
    methods: ['POST'],
    models: ['embeddinggemma', 'nomic', 'mock'],
    maxTextLength: 50000,
    ollamaUrl: OLLAMA_URL,
  });
};