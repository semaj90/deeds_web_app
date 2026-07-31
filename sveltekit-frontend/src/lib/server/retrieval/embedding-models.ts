/**
 * Embedding Models — Abstracted lane implementations
 * Primary: embeddinggemma (768-dim)
 * Fallback: quantized projection (512-dim)
 * Multimodal: CLIP (512-dim vision-language)
 */

import { logger } from '../logger';

export interface EmbeddingModel {
  embed(input: string | string[]): Promise<number[] | number[][]>;
  dimension: number;
  name: string;
}

/**
 * EmbeddingGemma Primary (768-dim)
 * Uses Ollama HTTP API for inference
 */
export class EmbeddingGemmaModel implements EmbeddingModel {
  dimension = 768;
  name = 'embeddinggemma:latest';
  private ollamaUrl: string;

  constructor(ollamaUrl: string = 'http://127.0.0.1:11434') {
    this.ollamaUrl = ollamaUrl;
  }

  async embed(input: string | string[]): Promise<number[] | number[][]> {
    if (typeof input === 'string') {
      return this.embedSingle(input);
    }

    // Batch embedding
    const results: number[][] = [];
    for (const text of input) {
      const emb = await this.embedSingle(text);
      results.push(emb);
    }
    return results;
  }

  async embedSingle(input: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.name,
          prompt: input
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as { embedding: number[] };

      if (!data.embedding || data.embedding.length !== this.dimension) {
        throw new Error(
          `Invalid embedding dimension: expected ${this.dimension}, got ${data.embedding?.length || 0}`
        );
      }

      return data.embedding;
    } catch (error) {
      logger.error('[EmbeddingGemma] Embedding failed', {
        input: input.slice(0, 100),
        error: String(error)
      });
      throw error;
    }
  }
}

/**
 * Quantized Projection (512-dim)
 * Projects 768-dim vectors to 512-dim via dimensionality reduction
 * Uses PCA or simple truncation + normalization
 */
export class QuantizedProjectionModel implements EmbeddingModel {
  dimension = 512;
  name = 'embeddinggemma:quantized-512';
  private primaryModel: EmbeddingGemmaModel;
  private projectionMatrix: Float32Array | null = null;

  constructor(primaryModel: EmbeddingGemmaModel) {
    this.primaryModel = primaryModel;
  }

  async embed(input: string | string[]): Promise<number[] | number[][]> {
    if (typeof input === 'string') {
      return this.embedSingle(input);
    }

    const results: number[][] = [];
    for (const text of input) {
      const emb = await this.embedSingle(text);
      results.push(emb);
    }
    return results;
  }

  async embedSingle(input: string): Promise<number[]> {
    try {
      // Get full 768-dim embedding from primary model
      const fullEmbedding = await this.primaryModel.embedSingle(input);

      // Project to 512-dim via truncation + L2 normalization
      const projected = this.projectVector(fullEmbedding);

      if (projected.length !== this.dimension) {
        throw new Error(
          `Invalid projected dimension: expected ${this.dimension}, got ${projected.length}`
        );
      }

      return projected;
    } catch (error) {
      logger.error('[QuantizedProjection] Embedding failed', {
        input: input.slice(0, 100),
        error: String(error)
      });
      throw error;
    }
  }

  /**
   * Simple projection: truncate to 512 dims + L2 normalize
   * Trade-off: simplicity vs. PCA-learned projection
   * For future: implement learned PCA matrix via GPU
   */
  private projectVector(vector: number[]): number[] {
    // Truncate to 512 dimensions
    const truncated = vector.slice(0, 512);

    // L2 normalization
    let norm = 0;
    for (const v of truncated) {
      norm += v * v;
    }
    norm = Math.sqrt(norm);

    if (norm === 0) return truncated;

    return truncated.map((v) => v / norm);
  }
}

/**
 * CLIP Vision-Language Model (512-dim multimodal)
 * Handles images, audio descriptions, and text
 * Falls back to Ollama if available, otherwise HTTP to Hugging Face
 */
export class CLIPModel implements EmbeddingModel {
  dimension = 512;
  name = 'clip-vit-base-patch32';
  private ollamaUrl: string;
  private useLocalModel: boolean;

  constructor(ollamaUrl: string = 'http://127.0.0.1:11434', useLocalModel: boolean = true) {
    this.ollamaUrl = ollamaUrl;
    this.useLocalModel = useLocalModel;
  }

  async embed(input: string | string[]): Promise<number[] | number[][]> {
    if (typeof input === 'string') {
      return this.embedSingle(input);
    }

    const results: number[][] = [];
    for (const text of input) {
      const emb = await this.embedSingle(text);
      results.push(emb);
    }
    return results;
  }

  /**
   * Embed text description (fallback to text-based retrieval)
   */
  async embedSingle(input: string): Promise<number[]> {
    try {
      // Try Ollama first (if CLIP model available locally)
      if (this.useLocalModel) {
        return await this.embedViaOllama(input);
      } else {
        return await this.embedViaHuggingFace(input);
      }
    } catch (error) {
      logger.warn('[CLIP] Primary embedding failed, trying fallback', {
        error: String(error)
      });

      // Fallback: try other method
      if (this.useLocalModel) {
        return await this.embedViaHuggingFace(input);
      } else {
        return await this.embedViaOllama(input);
      }
    }
  }

  /**
   * Embed image via URL or base64
   */
  async embedImage(imageInput: string): Promise<number[]> {
    try {
      if (!this.useLocalModel) {
        // Use Hugging Face if no local model
        const response = await fetch('https://api-inference.huggingface.co/models/openai/clip-vit-base-patch32', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: {
              image: imageInput,
              candidate_labels: ['evidence', 'person', 'document', 'other']
            }
          })
        });

        if (!response.ok) {
          throw new Error(`HF API ${response.status}: ${await response.text()}`);
        }

        const data = (await response.json()) as { embedding: number[] };
        if (!data.embedding || data.embedding.length !== this.dimension) {
          throw new Error(
            `Invalid embedding: expected ${this.dimension}-dim, got ${data.embedding?.length || 0}-dim`
          );
        }

        return data.embedding;
      } else {
        // Fallback to text description
        logger.warn('[CLIP] Image embedding via local model not supported, using text fallback');
        return this.embedSingle(`Evidence image: ${imageInput.slice(0, 100)}`);
      }
    } catch (error) {
      logger.error('[CLIP] Image embedding failed', {
        error: String(error)
      });
      throw error;
    }
  }

  /**
   * Embed audio via Hugging Face
   */
  async embedAudio(audioPath: string): Promise<number[]> {
    try {
      // For now, fallback to text description
      // Full audio embedding would require audio file upload to Hugging Face
      logger.warn('[CLIP] Audio embedding via local model not supported, using text fallback');
      return this.embedSingle(`Audio evidence: ${audioPath}`);
    } catch (error) {
      logger.error('[CLIP] Audio embedding failed', {
        error: String(error)
      });
      throw error;
    }
  }

  /**
   * Embed via Ollama (if CLIP model available)
   */
  private async embedViaOllama(input: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.name,
          prompt: input
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}`);
      }

      const data = (await response.json()) as { embedding: number[] };

      if (!data.embedding || data.embedding.length !== this.dimension) {
        throw new Error(
          `Invalid embedding: expected ${this.dimension}-dim, got ${data.embedding?.length || 0}-dim`
        );
      }

      return data.embedding;
    } catch (error) {
      throw new Error(`Ollama CLIP failed: ${String(error)}`);
    }
  }

  /**
   * Embed via Hugging Face API (fallback)
   */
  private async embedViaHuggingFace(input: string): Promise<number[]> {
    try {
      if (!process.env.HUGGINGFACE_API_KEY) {
        throw new Error('HUGGINGFACE_API_KEY not set');
      }

      const response = await fetch(
        'https://api-inference.huggingface.co/models/openai/clip-vit-base-patch32',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: input,
            options: {
              use_cache: true,
              wait_for_model: true
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`HF API ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as { embeddings?: number[] };

      if (!data.embeddings || data.embeddings.length !== this.dimension) {
        throw new Error(
          `Invalid embedding: expected ${this.dimension}-dim, got ${data.embeddings?.length || 0}-dim`
        );
      }

      return data.embeddings;
    } catch (error) {
      throw new Error(`Hugging Face CLIP failed: ${String(error)}`);
    }
  }
}

/**
 * Factory function to create all embedding models
 */
export function createEmbeddingModels(ollamaUrl?: string) {
  const primaryModel = new EmbeddingGemmaModel(ollamaUrl);

  return {
    primary: primaryModel,
    fallback: new QuantizedProjectionModel(primaryModel),
    multimodal: new CLIPModel(ollamaUrl, true) // Use local model by default
  };
}
