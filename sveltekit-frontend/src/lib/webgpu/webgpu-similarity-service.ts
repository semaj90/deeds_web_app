import type { QuantizedEmbedding } from '$lib/shared/embedding-types';
import { quantizedCosineSimilarity } from '$lib/shared/quantize';
import { WebGPUSimilarityEngine, type SimilarityResult } from './webgpu-similarity-engine.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface SimilaritySearchOptions {
  topK: number;
	threshold: number;
  useWebGPU: boolean;
	batchSize: number;
}

export interface SimilaritySearchResult {
  results: SimilarityResult[];
	totalDocuments: number;
  searchTime: number;
	method: 'webgpu' | 'cpu';
}

/**
 * High-level similarity search service using WebGPU acceleration
 */
export class WebGPUSimilarityService {
  private engine: WebGPUSimilarityEngine | null = null;
  private isInitialized = false;

  constructor() {
    this.initializeEngine();
  }

  private async initializeEngine(): Promise<void> {
    try {
      const supported = await WebGPUSimilarityEngine.isSupported();
      if (supported) {
        this.engine = new WebGPUSimilarityEngine({
          workgroupSize: 256,
          maxBatchSize: 1024,
          enableProfiling: true,
        });
        await this.engine.initialize();
        this.isInitialized = true;
        console.log('[WebGPU] Similarity engine initialized');
      } else {
        console.log('[WebGPU] Not supported, falling back to CPU');
      }
    } catch (error) {
      console.warn('[WebGPU] Initialization failed:', error);
    }
  }

  async searchSimilarDocuments(
    queryEmbedding: QuantizedEmbedding,
    documentEmbeddings: QuantizedEmbedding[],
    options: Partial<SimilaritySearchOptions> = {}
  ): Promise<SimilaritySearchResult> {
    const config: SimilaritySearchOptions = {
      topK: 10,
      threshold: 0.0,
      useWebGPU: true,
      batchSize: 512,
      ...options,
    };

    const startTime = performance.now();

    let results: SimilarityResult[];
    let method: 'webgpu' | 'cpu';

    if (this.isInitialized && config.useWebGPU && documentEmbeddings.length > 10) {
      try {
        results = await this.engine!.computeSimilarityBatch(
          queryEmbedding,
          documentEmbeddings,
          config.topK
        );
        method = 'webgpu';
      } catch (error) {
        console.warn('[WebGPU] GPU search failed, falling back to CPU:', error);
        results = this.fallbackCPUSearch(queryEmbedding, documentEmbeddings, config);
        method = 'cpu';
      }
    } else {
      results = this.fallbackCPUSearch(queryEmbedding, documentEmbeddings, config);
      method = 'cpu';
    }

    results = results.filter((r) => r.score >= config.threshold);

    const searchTime = performance.now() - startTime;

    return {
      results,
      totalDocuments: documentEmbeddings.length,
      searchTime,
      method,
    };
  }

  private fallbackCPUSearch(
    queryEmbedding: QuantizedEmbedding,
    documentEmbeddings: QuantizedEmbedding[],
    config: SimilaritySearchOptions
  ): SimilarityResult[] {
    const results: SimilarityResult[] = [];

    for (let i = 0; i < documentEmbeddings.length; i++) {
      const score = quantizedCosineSimilarity(queryEmbedding, documentEmbeddings[i]);
      results.push({ index: i, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, config.topK);
  }

  async batchSearch(
    queryEmbeddings: QuantizedEmbedding[],
    documentEmbeddings: QuantizedEmbedding[],
    options: Partial<SimilaritySearchOptions> = {}
  ): Promise<SimilaritySearchResult[]> {
    const results: SimilaritySearchResult[] = [];

    for (const query of queryEmbeddings) {
      const result = await this.searchSimilarDocuments(query, documentEmbeddings, options);
      results.push(result);
    }

    return results;
  }

  getStats() {
    return {
      webgpuSupported: this.isInitialized,
      engineStatus: this.engine ? 'initialized' : 'unavailable',
    };
  }

  destroy(): void {
    if (this.engine) {
      this.engine.destroy();
      this.engine = null;
    }
    this.isInitialized = false;
  }
}

export const webgpuSimilarityService = new WebGPUSimilarityService();
