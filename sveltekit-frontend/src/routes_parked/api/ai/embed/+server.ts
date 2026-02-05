import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { OPENAI_API_KEY, NOMIC_API_KEY } from '$env/static/private';

interface EmbedRequest {
  text: string;
  model?: 'openai' | 'nomic' | 'mock';
  dimensions?: number;
}

interface EmbedResponse {
  embedding: number[];
  model: string;
  dimensions: number;
  tokens?: number;
}

// OpenAI embedding function
async function getOpenAIEmbedding(text: string): Promise<{ embedding: number[]; tokens: number }> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small', // 1536 dimensions, good for legal text
      input: text,
      encoding_format: 'float'
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return {
    embedding: data.data[0].embedding,
    tokens: data.usage.total_tokens
  };
}

// Nomic embedding function
async function getNomicEmbedding(text: string): Promise<{ embedding: number[] }> {
  if (!NOMIC_API_KEY) {
    throw new Error('Nomic API key not configured');
  }

  const response = await fetch('https://api-atlas.nomic.ai/v1/embedding/text', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOMIC_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'nomic-embed-text-v1.5',
      texts: [text],
      task_type: 'search_document',
      dimensionality_reduction: 768 // Reduce from 8192 to 768 for better performance
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Nomic API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return {
    embedding: data.embeddings[0]
  };
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { text, model = 'mock', dimensions }: EmbedRequest = await request.json();

    if (!text || typeof text !== 'string') {
      return json(
        { error: 'Text is required and must be a string' },
        { status: 400 }
      );
    }

    if (text.length > 50000) {
      return json(
        { error: 'Text too long. Maximum 50,000 characters allowed.' },
        { status: 400 }
      );
    }

    let result: EmbedResponse;

    switch (model) {
      case 'openai': {
        const { embedding, tokens } = await getOpenAIEmbedding(text);
        result = {
          embedding,
          model: 'text-embedding-3-small',
          dimensions: embedding.length,
          tokens
        };
        break;
      }

      case 'nomic': {
        const { embedding } = await getNomicEmbedding(text);
        result = {
          embedding,
          model: 'nomic-embed-text-v1.5',
          dimensions: embedding.length
        };
        break;
      }

      case 'mock': {
        // Mock embedding for testing - generate deterministic vector based on text
        const targetDim = dimensions || 768;
        const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const embedding = Array.from({ length: targetDim }, (_, i) => Math.sin((hash + i) / 100) * 0.5);
        
        result = {
          embedding,
          model: 'mock-embeddings',
          dimensions: targetDim,
          tokens: text.split(' ').length
        };
        break;
      }

      default:
        return json(
          { error: `Unsupported model: ${model}. Use 'openai', 'nomic', or 'mock'` },
          { status: 400 }
        );
    }

    // Optional: Apply dimensionality reduction if requested
    if (dimensions && dimensions < result.embedding.length) {
      result.embedding = result.embedding.slice(0, dimensions);
      result.dimensions = dimensions;
    }

    return json(result);

  } catch (error) {
    console.error('Embedding generation error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return json(
          { error: 'Embedding service configuration error' },
          { status: 500 }
        );
      }
      
      if (error.message.includes('rate limit') || error.message.includes('quota')) {
        return json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }
    }

    return json(
      { error: 'Failed to generate embedding' },
      { status: 500 }
    );
  }
};

export const GET: RequestHandler = async () => {
  return json({
    message: 'Embedding API endpoint',
    methods: ['POST'],
    models: ['openai', 'nomic', 'mock'],
    maxTextLength: 50000
  });
};