/**
 * Embedding Orchestrator
 * Routes embedding requests through the selected lane (768-dim primary, 512-dim fallback, or CLIP multimodal)
 */

import {
  selectEmbeddingLane,
  getCollectionName,
  estimateVramUsage,
  type EmbeddingLane,
  type EmbeddingLaneSelector
} from '$lib/config/embedding-lanes';
import {
  createEmbeddingModels,
  type EmbeddingModel,
  EmbeddingGemmaModel,
  QuantizedProjectionModel,
  CLIPModel
} from './embedding-models';
import { logger } from '../logger.js';
import { ENV } from '$lib/server/env.server.js';

export interface EmbeddingRequest {
  text: string;
  type: 'document' | 'query' | 'image' | 'audio';
  userId?: string;
  caseId?: string;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingResult {
  embedding: number[];
  dimension: number;
  lane: EmbeddingLane;
  model: string;
  confidence: number;
  processingTimeMs: number;
  cached: boolean;
}

class EmbeddingOrchestrator {
  private laneSelector: EmbeddingLaneSelector | null = null;
  private embeddingCache = new Map<string, EmbeddingResult>();
  private readonly maxCacheSize = 10000;
  private models: ReturnType<typeof createEmbeddingModels> | null = null;

  /**
   * Initialize orchestrator with available VRAM
   */
  async initialize(
    availableVramMb: number,
    preferredLane?: EmbeddingLane,
    ollamaUrl?: string
  ): Promise<void> {
    this.laneSelector = selectEmbeddingLane(availableVramMb, preferredLane);
    this.models = createEmbeddingModels(ollamaUrl || ENV.OLLAMA_BASE_URL || 'http://127.0.0.1:11434');
    logger.info('[EmbeddingOrchestrator] Initialized', {
      selected_lane: this.laneSelector.selected_lane,
      fallback_chain: this.laneSelector.fallback_chain,
      reasoning: this.laneSelector.reasoning,
      ollama_url: ollamaUrl || ENV.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
    });
  }

  /**
   * Embed text using the selected lane
   */
  async embed(req: EmbeddingRequest): Promise<EmbeddingResult> {
    if (!this.laneSelector) {
      throw new Error('EmbeddingOrchestrator not initialized. Call initialize() first.');
    }

    const cacheKey = this.getCacheKey(req);
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    const startTime = Date.now();
    let result: EmbeddingResult | null = null;

    // Try primary lane
    try {
      result = await this.embedWithLane(req, this.laneSelector.selected_lane);
    } catch (error) {
      logger.warn(`[EmbeddingOrchestrator] Primary lane ${this.laneSelector.selected_lane} failed`, {
        error: String(error)
      });
    }

    // Try fallback lanes
    if (!result && this.laneSelector.fallback_chain.length > 0) {
      for (const fallbackLane of this.laneSelector.fallback_chain) {
        try {
          logger.info(`[EmbeddingOrchestrator] Trying fallback lane: ${fallbackLane}`);
          result = await this.embedWithLane(req, fallbackLane);
          break;
        } catch (error) {
          logger.warn(`[EmbeddingOrchestrator] Fallback lane ${fallbackLane} failed`, {
            error: String(error)
          });
        }
      }
    }

    if (!result) {
      throw new Error(
        `[EmbeddingOrchestrator] All embedding lanes failed. Primary: ${this.laneSelector.selected_lane}, Fallbacks: ${this.laneSelector.fallback_chain.join(', ')}`
      );
    }

    const processingTimeMs = Date.now() - startTime;
    const finalResult = { ...result, processingTimeMs, cached: false };

    // Cache result
    if (this.embeddingCache.size < this.maxCacheSize) {
      this.embeddingCache.set(cacheKey, finalResult);
    }

    return finalResult;
  }

  /**
   * Embed with a specific lane
   */
  private async embedWithLane(req: EmbeddingRequest, lane: EmbeddingLane): Promise<EmbeddingResult> {
    switch (lane) {
      case 'primary-768d':
        return this.embedWithEmbeddingGemma(req);
      case 'fallback-512d':
        return this.embedWithFallback(req);
      case 'multimodal-clip-512d':
        return this.embedWithClip(req);
      default:
        throw new Error(`Unknown embedding lane: ${lane}`);
    }
  }

  /**
   * Embed using embeddinggemma (768-dim primary)
   */
  private async embedWithEmbeddingGemma(req: EmbeddingRequest): Promise<EmbeddingResult> {
    if (!this.models) {
      throw new Error('EmbeddingOrchestrator not initialized');
    }

    const embedding = (await this.models.primary.embedSingle(req.text)) as number[];

    if (!embedding || embedding.length !== 768) {
      throw new Error(
        `Invalid embedding from embeddinggemma: expected 768-dim, got ${embedding?.length || 0}-dim`
      );
    }

    return {
      embedding,
      dimension: 768,
      lane: 'primary-768d',
      model: 'embeddinggemma:latest',
      confidence: 0.95,
      processingTimeMs: 0,
      cached: false
    };
  }

  /**
   * Embed using quantized projection (512-dim fallback)
   */
  private async embedWithFallback(req: EmbeddingRequest): Promise<EmbeddingResult> {
    if (!this.models) {
      throw new Error('EmbeddingOrchestrator not initialized');
    }

    const embedding = (await this.models.fallback.embedSingle(req.text)) as number[];

    if (!embedding || embedding.length !== 512) {
      throw new Error(
        `Invalid embedding from fallback: expected 512-dim, got ${embedding?.length || 0}-dim`
      );
    }

    return {
      embedding,
      dimension: 512,
      lane: 'fallback-512d',
      model: 'embeddinggemma:quantized-512',
      confidence: 0.85,
      processingTimeMs: 0,
      cached: false
    };
  }

  /**
   * Embed using CLIP (multimodal)
   */
  private async embedWithClip(req: EmbeddingRequest): Promise<EmbeddingResult> {
    if (!this.models) {
      throw new Error('EmbeddingOrchestrator not initialized');
    }

    if (req.type !== 'image' && req.type !== 'audio' && req.type !== 'query') {
      throw new Error(`CLIP embedding supports 'image', 'audio', and 'query' types, got '${req.type}'`);
    }

    let embedding: number[];

    if (req.type === 'image') {
      embedding = await this.models.multimodal.embedImage(req.text);
    } else if (req.type === 'audio') {
      embedding = await this.models.multimodal.embedAudio(req.text);
    } else {
      embedding = (await this.models.multimodal.embedSingle(req.text)) as number[];
    }

    if (!embedding || embedding.length !== 512) {
      throw new Error(`Invalid embedding from CLIP: expected 512-dim, got ${embedding?.length || 0}-dim`);
    }

    return {
      embedding,
      dimension: 512,
      lane: 'multimodal-clip-512d',
      model: 'clip-vit-base-patch32',
      confidence: 0.80,
      processingTimeMs: 0,
      cached: false
    };
  }

  /**
   * Get collection name for storing embeddings
   */
  getCollectionName(collectionType: 'primary' | 'fallback' | 'multimodal' = 'primary'): string {
    if (!this.laneSelector) {
      throw new Error('EmbeddingOrchestrator not initialized');
    }
    return getCollectionName(this.laneSelector.selected_lane, collectionType);
  }

  /**
   * Get diagnostic information about current lane selection
   */
  getDiagnostics() {
    if (!this.laneSelector) {
      return { initialized: false };
    }

    return {
      initialized: true,
      selected_lane: this.laneSelector.selected_lane,
      preferred_lane: this.laneSelector.preferred_lane,
      fallback_chain: this.laneSelector.fallback_chain,
      available_vram_mb: this.laneSelector.available_vram_mb,
      reasoning: this.laneSelector.reasoning,
      cache_size: this.embeddingCache.size,
      estimated_vram_usage: {
        primary: estimateVramUsage('primary-768d'),
        fallback: estimateVramUsage('fallback-512d'),
        multimodal: estimateVramUsage('multimodal-clip-512d')
      }
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
    logger.info('[EmbeddingOrchestrator] Cache cleared');
  }

  /**
   * Cache key generation
   */
  private getCacheKey(req: EmbeddingRequest): string {
    return `${req.type}:${req.text}`;
  }
}

export const embeddingOrchestrator = new EmbeddingOrchestrator();
