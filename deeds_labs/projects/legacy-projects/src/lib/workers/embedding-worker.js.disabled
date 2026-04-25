import { parentPort, workerData } from "worker_threads";
import fetch from "node-fetch";

/**
 * Phase 4: Embedding Worker
 * Handles batch embedding generation with GPU optimization
 */

class EmbeddingWorker {
  constructor() {
    this.workerId = workerData?.workerId || "embedding-worker";
    this.config = {
      ollamaUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11435",
      embeddingModel: process.env.EMBEDDING_MODEL || "nomic-embed-text",
      batchSize: 10,
      maxRetries: 3,
      timeout: 30000,
      cacheEnabled: true,
    };

    this.cache = new Map();
    this.stats = {
      processed: 0,
      cached: 0,
      errors: 0,
      totalProcessingTime: 0,
    };

    console.log(`🧮 Embedding Worker ${this.workerId} initialized`);
  }

  /**
   * Process incoming messages
   */
  handleMessage(message) {
    const { taskId, data, options } = message;

    try {
      let result;

      switch (data.type) {
        case "generate_embeddings":
          result = this.generateEmbeddings(data.texts, options);
          break;
        case "batch_embeddings":
          result = this.batchEmbeddings(data.textBatches, options);
          break;
        case "cache_embedding":
          result = this.cacheEmbedding(data.text, data.embedding, options);
          break;
        case "get_cached":
          result = this.getCachedEmbedding(data.text, options);
          break;
        case "clear_cache":
          result = this.clearCache(options);
          break;
        case "get_stats":
          result = this.getStats();
          break;
        default:
          throw new Error(`Unknown embedding task type: ${data.type}`);
      }

      // Handle async results
      if (result instanceof Promise) {
        result
          .then((asyncResult) => {
            parentPort.postMessage({
              taskId,
              success: true,
              data: asyncResult,
            });
          })
          .catch((error) => {
            parentPort.postMessage({
              taskId,
              success: false,
              error: error.message,
            });
          });
      } else {
        parentPort.postMessage({
          taskId,
          success: true,
          data: result,
        });
      }
    } catch (error) {
      console.error(`❌ Embedding error in ${this.workerId}:`, error);
      parentPort.postMessage({
        taskId,
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Generate embeddings for texts
   */
  async generateEmbeddings(texts, options = {}) {
    const startTime = Date.now();
    const textArray = Array.isArray(texts) ? texts : [texts];
    const results = [];

    try {
      console.log(`🔄 Generating embeddings for ${textArray.length} texts`);

      // Process in batches to optimize GPU usage
      const batchSize = options.batchSize || this.config.batchSize;

      for (let i = 0; i < textArray.length; i += batchSize) {
        const batch = textArray.slice(i, i + batchSize);
        const batchResults = await this.processBatch(batch, options);
        results.push(...batchResults);
      }

      const processingTime = Date.now() - startTime;
      this.stats.totalProcessingTime += processingTime;
      this.stats.processed += textArray.length;

      console.log(
        `✅ Generated ${textArray.length} embeddings in ${processingTime}ms`
      );

      return {
        embeddings: results,
        stats: {
          totalTexts: textArray.length,
          processingTime,
          averageTime: processingTime / textArray.length,
          cached: results.filter((r) => r.cached).length,
          workerId: this.workerId,
        },
      };
    } catch (error) {
      this.stats.errors++;
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Process a batch of texts
   */
  async processBatch(texts, options = {}) {
    const results = [];

    for (const text of texts) {
      try {
        // Check cache first
        if (this.config.cacheEnabled) {
          const cached = this.getCachedEmbedding(text);
          if (cached) {
            results.push({
              text,
              embedding: cached.embedding,
              cached: true,
              timestamp: cached.timestamp,
            });
            this.stats.cached++;
            continue;
          }
        }

        // Generate new embedding
        const embedding = await this.generateSingleEmbedding(text, options);

        const result = {
          text,
          embedding,
          cached: false,
          timestamp: new Date().toISOString(),
          model: this.config.embeddingModel,
          dimension: embedding.length,
        };

        // Cache the result
        if (this.config.cacheEnabled) {
          this.cacheEmbedding(text, embedding);
        }

        results.push(result);
      } catch (error) {
        console.error(
          `❌ Failed to generate embedding for text: ${error.message}`
        );
        results.push({
          text,
          error: error.message,
          cached: false,
          timestamp: new Date().toISOString(),
        });
        this.stats.errors++;
      }
    }

    return results;
  }

  /**
   * Generate single embedding via Ollama
   */
  async generateSingleEmbedding(text, options = {}) {
    const model = options.model || this.config.embeddingModel;
    const maxRetries = options.maxRetries || this.config.maxRetries;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(
          `${this.config.ollamaUrl}/api/embeddings`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              prompt: text.trim(),
            }),
            timeout: this.config.timeout,
          }
        );

        if (!response.ok) {
          throw new Error(
            `Ollama API error: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();

        if (!data.embedding || !Array.isArray(data.embedding)) {
          throw new Error("Invalid embedding response from Ollama");
        }

        return data.embedding;
      } catch (error) {
        console.error(
          `❌ Embedding attempt ${attempt}/${maxRetries} failed:`,
          error.message
        );

        if (attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Process multiple batches concurrently
   */
  async batchEmbeddings(textBatches, options = {}) {
    const results = [];
    const concurrency = options.concurrency || 2; // Limit concurrent batches for GPU

    // Process batches with controlled concurrency
    for (let i = 0; i < textBatches.length; i += concurrency) {
      const batchPromises = [];

      for (let j = 0; j < concurrency && i + j < textBatches.length; j++) {
        const batch = textBatches[i + j];
        batchPromises.push(
          this.processBatch(batch.texts, { ...options, batchId: batch.id })
        );
      }

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.flat());
    }

    return {
      totalEmbeddings: results.length,
      successful: results.filter((r) => !r.error).length,
      errors: results.filter((r) => r.error).length,
      embeddings: results,
    };
  }

  /**
   * Cache an embedding
   */
  cacheEmbedding(text, embedding, options = {}) {
    if (!this.config.cacheEnabled) return false;

    const hash = this.generateTextHash(text);
    const cacheEntry = {
      text,
      embedding,
      timestamp: new Date().toISOString(),
      hits: 0,
      workerId: this.workerId,
    };

    this.cache.set(hash, cacheEntry);

    // Implement LRU eviction if cache gets too large
    if (this.cache.size > 10000) {
      this.evictOldest();
    }

    return true;
  }

  /**
   * Get cached embedding
   */
  getCachedEmbedding(text, options = {}) {
    if (!this.config.cacheEnabled) return null;

    const hash = this.generateTextHash(text);
    const cached = this.cache.get(hash);

    if (cached) {
      cached.hits++;
      cached.lastAccess = new Date().toISOString();
      return cached;
    }

    return null;
  }

  /**
   * Generate hash for text caching
   */
  generateTextHash(text) {
    // Simple hash function - could use crypto for better distribution
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  /**
   * Evict oldest cache entries
   */
  evictOldest() {
    const entries = Array.from(this.cache.entries()).sort(
      (a, b) =>
        new Date(a[1].lastAccess || a[1].timestamp) -
        new Date(b[1].lastAccess || b[1].timestamp)
    );

    // Remove oldest 10%
    const toRemove = Math.floor(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }

    console.log(`🧹 Evicted ${toRemove} old cache entries`);
  }

  /**
   * Clear cache
   */
  clearCache(options = {}) {
    const size = this.cache.size;
    this.cache.clear();

    console.log(`🧹 Cleared embedding cache (${size} entries)`);

    return {
      cleared: size,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get worker statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      cacheHitRate: this.stats.cached / Math.max(this.stats.processed, 1),
      averageProcessingTime:
        this.stats.totalProcessingTime / Math.max(this.stats.processed, 1),
      workerId: this.workerId,
      config: {
        model: this.config.embeddingModel,
        batchSize: this.config.batchSize,
        cacheEnabled: this.config.cacheEnabled,
      },
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Test Ollama connection
      const response = await fetch(`${this.config.ollamaUrl}/api/tags`, {
        timeout: 5000,
      });

      if (!response.ok) {
        throw new Error(`Ollama not available: ${response.status}`);
      }

      const data = await response.json();
      const hasEmbeddingModel = data.models?.some((m) =>
        m.name.includes(this.config.embeddingModel)
      );

      return {
        status: "healthy",
        ollama: "connected",
        embeddingModel: hasEmbeddingModel ? "available" : "not_found",
        cache: `${this.cache.size} entries`,
        stats: this.getStats(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
      };
    }
  }
}

// Initialize worker
const worker = new EmbeddingWorker();

// Handle messages from main thread
parentPort.on("message", (message) => {
  worker.handleMessage(message);
});

// Send ready signal
parentPort.postMessage({
  type: "ready",
  workerId: worker.workerId,
  config: worker.config,
});
