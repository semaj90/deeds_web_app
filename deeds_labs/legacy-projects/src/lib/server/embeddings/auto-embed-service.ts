// src/lib/server/embeddings/auto-embed-service.ts
import { OllamaClient } from '$lib/ai/ollama-client';
import { createHash } from 'crypto';
import type { Redis } from 'ioredis'; // Assuming ioredis is installed

export class AutoEmbedService {
  private ollama = new OllamaClient();
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async embedText(text: string, model: string = 'embeddinggemma:latest'): Promise<number[]> {
    // Check cache first
    const cacheKey = this.getCacheKey(text, model);
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      console.log('✅ Embedding cache hit');
      return JSON.parse(cached);
    }

    // Generate embedding
    const embedding = await this.ollama.embed(text, model);

    // Cache with TTL (1 week)
    await this.redis.setex(
      cacheKey,
      604800,
      JSON.stringify(embedding)
    );

    return embedding;
  }

  async embedBatch(
    texts: string[],
    model: string = 'embeddinggemma:latest',
    batchSize: number = 32
  ): Promise<number[][]> {
    const embeddings: number[][] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const batchEmbeddings = await Promise.all(
        batch.map(text => this.embedText(text, model))
      );

      embeddings.push(...batchEmbeddings);

      console.log(`Embedded ${i + batch.length}/${texts.length} chunks`);
    }

    return embeddings;
  }

  private getCacheKey(text: string, model: string): string {
    const hash = createHash('sha256').update(text).digest('hex');
    return `embedding:${model}:${hash}`;
  }
}