import { Ollama } from 'ollama';
import { env } from '../env.js';
import { logger } from '../utils/logger.js';
// Construct Ollama client using the named export
const ollama = new Ollama({ host: env.ollama.baseUrl } as any);

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    logger.info('Generating embedding', { textLength: text.length, model: env.ollama.embeddingModel });

    // Try primary model: embeddinggemma:latest (with flash-attention-2)
    try {
      const response = await ollama.embeddings({
        model: env.ollama.embeddingModel,
        prompt: text,
        options: {
          // Flash-attention-2 optimizations (configured in Modelfile)
          num_gpu: 30, // Use 30 GPU layers (RTX 3060 Ti optimized)
          use_mmap: true,
          use_mlock: false,
        } as any, // Ollama types don't include flash_attention yet
      });

      if (!response.embedding || !Array.isArray(response.embedding)) {
        throw new Error('Invalid embedding response from primary model');
      }

      logger.info('Embedding generated', {
        model: env.ollama.embeddingModel,
        dimensions: response.embedding.length
      });
      return response.embedding;
    } catch (primaryError) {
      // Fallback to nomic-embed-text if embeddinggemma fails
      logger.warn('Primary embedding model failed, falling back to nomic-embed-text', {
        error: primaryError
      });

      const fallbackResponse = await ollama.embeddings({
        model: 'nomic-embed-text',
        prompt: text,
        options: {
          num_gpu: 30,
          use_mmap: true,
        },
      });

      if (!fallbackResponse.embedding || !Array.isArray(fallbackResponse.embedding)) {
        throw new Error('Invalid embedding response from fallback model');
      }

      logger.info('Fallback embedding generated', {
        model: 'nomic-embed-text',
        dimensions: fallbackResponse.embedding.length
      });
      return fallbackResponse.embedding;
    }
  } catch (error) {
    logger.error('All embedding generation methods failed', { error });
    throw error;
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const embeddings = await Promise.all(texts.map((text) => generateEmbedding(text)));
    return embeddings;
  } catch (error) {
    logger.error('Batch embedding generation failed', { error });
    throw error;
  }
}
