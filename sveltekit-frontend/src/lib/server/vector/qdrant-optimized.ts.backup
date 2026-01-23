/**
 * Optimized Qdrant Service with Low Memory Usage and Cache-Like Logging System
 * Enhanced for Windows native deployment with memory-efficient vector operations
 * Integrated with NES-style cache orchestrator and production logging
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { generateEmbedding } from '../ai/embeddings-simple.js';
import logger from '../production-logger.js';

type LogContext = Record<string, any>;

// Simple caching fallback if service not available
const cachingService = {
  get: async (_key: string): Promise<any> => null,
  set: (_key: string, _value: any, _ttl?: number): void => {},
  delete: (_key: string): void => {},
  clear: (): void => {}
};

// Environment detection
const isDev = typeof process !== 'undefined' && import.meta.env?.NODE_ENV === 'development';

// Memory-optimized interfaces
export interface OptimizedQdrantConfig {
  memoryLimits: {
    vectorCacheSize: number; // KB
    searchResultCache: number; // KB
    embeddingCache: number; // KB
    queryHistoryCache: number; // KB
    totalMemoryBudget: number; // KB
  };
  performance: {
    batchSize: number;
    maxConcurrentQueries: number;
    searchTimeout: number;
    cacheHitRatio: number;
    compressionEnabled: boolean;
  };
  logging: {
    cacheOperations: boolean;
    performanceMetrics: boolean;
    memoryUsage: boolean;
    searchAnalytics: boolean;
    errorTracking: boolean;
  };
}

// Cache-like logging entry for vector operations
export interface VectorCacheLogEntry {
  timestamp: string;
  operation: 'search' | 'upsert' | 'delete' | 'batch_upsert';
  collection: string;
  vectorId?: string;
  queryVector?: number[];
  resultCount?: number;
  processingTime?: number;
  memoryUsed?: number;
  similarity?: number;
  cacheHit?: boolean;
  metadata?: { [key: string]: any };
}

// Memory-efficient vector cache entry
export interface VectorCacheEntry {
  id: string;
  vector: Float32Array;
  payload: unknown;
  timestamp: number;
  accessCount: number;
  collection: string;
  memoryFootprint: number;
}

// Search result cache with LRU eviction
export interface SearchCache {
  queryHash: string;
  results: unknown[];
  timestamp: number;
  accessCount: number;
  memorySize: number;
  ttl: number;
}

type QdrantClientShapes = {
  // older helpers
  getCollections?: () => Promise<unknown>;
  // some clients expose collectionsApi
  collectionsApi?: { getCollections?: () => Promise<unknown> };
  // alternative collections shape
  collections?: { get?: () => Promise<unknown> };
  // some clients expose a health() helper
  health?: () => Promise<unknown>;
};

class OptimizedQdrantService {
  private client: QdrantClient | null = null;
  private config: OptimizedQdrantConfig;
  private vectorCache = new Map<string, VectorCacheEntry>();
  private searchCache = new Map<string, SearchCache>();
  private embeddingCache = new Map<string, { vector: number[]; timestamp: number }>();
  private queryHistory: VectorCacheLogEntry[] = [];
  private memoryUsage = { vectorCache: 0, searchCache: 0, queryHistory: 0, total: 0 };
  private operationQueue = new Map<string, Promise<any>>();
  private concurrentQueries = 0;
  private performanceMetrics = {
    totalQueries: 0,
    cacheHits: 0,
    averageLatency: 0,
    memoryEfficiency: 0,
    errorRate: 0
  };

  constructor() {
    this.config = this.getOptimizedConfig();
    this.initializeClient();
    this.setupMemoryManagement();
    this.setupLogging();
  }

  private getOptimizedConfig(): OptimizedQdrantConfig {
    const isWindows = typeof process !== 'undefined' && process.platform === 'win32';
    return {
      memoryLimits: {
        vectorCacheSize: isWindows ? 2048 : 1024,
        searchResultCache: isWindows ? 1024 : 512,
        embeddingCache: 256,
        queryHistoryCache: 256,
        totalMemoryBudget: isWindows ? 4096 : 2048
      },
      performance: {
        batchSize: isWindows ? 50 : 25,
        maxConcurrentQueries: isWindows ? 10 : 5,
        searchTimeout: 5000,
        cacheHitRatio: 0.85,
        compressionEnabled: true
      },
      logging: {
        cacheOperations: true,
        performanceMetrics: true,
        memoryUsage: true,
        searchAnalytics: true,
        errorTracking: true
      }
    };
  }

  private initializeClient(): void {
    const env = (import.meta.env as any) || {};
    const qdrantUrl = (typeof process !== 'undefined' ? (env.QDRANT_URL ?? env.VITE_QDRANT_URL) : undefined);

    if (!qdrantUrl) {
      logger.warn('Qdrant not configured - vector operations will be disabled', { component: 'QdrantOptimized' });
      return;
    }

    try {
      const qdrantApiKey = (typeof process !== 'undefined' ? (env.QDRANT_API_KEY ?? env.VITE_QDRANT_API_KEY) : undefined);

      this.client = new QdrantClient({
        url: qdrantUrl,
        apiKey: qdrantApiKey
      });

      logger.info('Optimized Qdrant client initialized', {
        component: 'QdrantOptimized',
        service: 'qdrant',
        memoryBudget: this.config.memoryLimits.totalMemoryBudget,
        windowsOptimized: typeof process !== 'undefined' && process.platform === 'win32',
        dev: isDev
      });
    } catch (error: Error | unknown) {
      logger.error('Failed to initialize Qdrant client', {
        component: 'QdrantOptimized',
        service: 'qdrant',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private setupMemoryManagement(): void {
    setInterval(() => { this.cleanupMemory() }, 30000);
    setInterval(() => { this.collectMetrics() }, 60000);
  }

  private setupLogging(): void {
    if (this.config.logging.cacheOperations) {
      logger.info('Vector cache-like logging system initialized', {
        component: 'QdrantOptimized',
        service: 'qdrant',
        cacheTypes: ['vector', 'search', 'query_history'],
        memoryBudget: this.config.memoryLimits.totalMemoryBudget
      });
    }
  }

  // Helper to safely cast extended objects into LogContext for logger calls
  private asLogContext(extra: Record<string, unknown>): LogContext {
    return extra as unknown as LogContext;
  }

  // Helpers for embedding cache which were missing
  private async getCachedEmbedding(text: string): Promise<number[] | null> {
    const entry = this.embeddingCache.get(text);
    if (entry && (Date.now() - entry.timestamp < 3600000)) { // 1 hour TTL
      return entry.vector;
    }
    return null;
  }

  private cacheEmbedding(text: string, vector: number[]): void {
     if (this.embeddingCache.size > 1000) {
      // Simple eviction: remove first key
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey) this.embeddingCache.delete(firstKey);
    }
    this.embeddingCache.set(text, { vector, timestamp: Date.now() });
  }

  private getSearchCache(queryHash: string): SearchCache | undefined {
    const entry = this.searchCache.get(queryHash);
    if (entry && (Date.now() - entry.timestamp < entry.ttl)) {
      entry.accessCount++;
      entry.timestamp = Date.now(); // Update generic LRU timestamp
      return entry;
    }
    return undefined;
  }

  private setSearchCache(queryHash: string, results: any[]): void {
    const memorySize = this.estimateResultMemory(results);
    const entry: SearchCache = {
      queryHash,
      results,
      timestamp: Date.now(),
      accessCount: 1,
      memorySize,
      ttl: 60000 // 1 minute
    };

    // Eviction
    const targetMemory = this.config.memoryLimits.searchResultCache * 1024;
    while (this.memoryUsage.searchCache + memorySize > targetMemory) {
        this.evictLeastUsedSearch();
        if (this.searchCache.size === 0) break;
    }

    this.searchCache.set(queryHash, entry);
    this.memoryUsage.searchCache += memorySize;
  }

  private logVectorOperation(entry: VectorCacheLogEntry): void {
    if (this.config.logging.cacheOperations) {
        // simplified logging
        // In real impl, we might push to this.queryHistory
        if (this.queryHistory.length > 50) { // Limit history size
            this.queryHistory.shift();
        }
        this.queryHistory.push(entry);
    }
  }

  // Memory-optimized search with caching
  public async search(
    collection: string,
    query: string | number[],
    options: { limit?: number; offset?: number; filter?: unknown; threshold?: number; useCache?: boolean } = {}
  ): Promise<any[]> {
    const startTime = Date.now();
    const context: LogContext = { component: 'QdrantOptimized', service: 'qdrant' };

    try {
      if (this.concurrentQueries >= this.config.performance.maxConcurrentQueries) {
        throw new Error('Too many concurrent queries - rate limited');
      }
      this.concurrentQueries++;

      let queryVector: number[];

      if (typeof query === 'string') {
        const cached = await this.getCachedEmbedding(query);
        if (cached) {
          queryVector = cached;
        } else {
          // Fix: generateEmbedding is an object, use .generate()
          const generated = await generateEmbedding.generate(query);
          queryVector = generated || [];
          if (queryVector.length > 0) {
            this.cacheEmbedding(query, queryVector);
          }
        }
      } else {
        queryVector = query;
      }

      if (!queryVector || queryVector.length === 0) {
        throw new Error('Invalid query vector');
      }

      const queryHash = this.generateQueryHash(collection, JSON.stringify(options) + queryVector.slice(0, 5).join(','));

      if (options.useCache !== false) {
        const cached = this.getSearchCache(queryHash);
        if (cached) {
          this.logVectorOperation({
            timestamp: new Date().toISOString(),
            operation: 'search',
            collection: collection,
            queryVector: queryVector.slice(0, 3),
            resultCount: cached.results.length, // Fixed casting
            processingTime: Date.now() - startTime,
            memoryUsed: cached.memorySize,
            cacheHit: true
          });
          this.performanceMetrics.cacheHits++;
          this.performanceMetrics.totalQueries++;
          return cached.results as any[];
        }
      }

      if (!this.client) {
        throw new Error('Qdrant client not initialized');
      }

      const searchParams = {
        vector: queryVector,
        limit: Math.min(options?.limit ?? 20, 100),
        offset: options?.offset ?? 0,
        filter: options.filter,
        with_vector: false,
        with_payload: true,
        score_threshold: options.threshold ?? 0.7
      };

      const results = await this.client.search(collection, searchParams as any);

      const formattedResults = (results ?? []).map((hit: any) => ({
        id: hit.id,
        score: hit.score,
        payload: hit.payload
      }));

      if (options.useCache !== false) {
        this.setSearchCache(queryHash, formattedResults);
      }

      const processingTime = Date.now() - startTime;
      this.logVectorOperation({
        timestamp: new Date().toISOString(),
        operation: 'search',
        collection: collection,
        queryVector: queryVector.slice(0, 3),
        resultCount: formattedResults.length,
        processingTime: processingTime,
        memoryUsed: this.estimateResultMemory(formattedResults),
        similarity: formattedResults[0]?.score
      });

      this.performanceMetrics.totalQueries++;
      this.updateAverageLatency(processingTime);

      logger.info('Qdrant search completed', { ...context, processingTime });

      return formattedResults;
    } catch (error: Error | unknown) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Qdrant search failed', {
          ...context,
          collection,
          errorMessage,
          error: error instanceof Error ? error : new Error(errorMessage)
      });

      this.performanceMetrics.errorRate = (this.performanceMetrics.errorRate * this.performanceMetrics.totalQueries + 1) / (this.performanceMetrics.totalQueries + 1);
      throw error;
    } finally {
      this.concurrentQueries = Math.max(0, this.concurrentQueries - 1);
    }
  }

  // Memory-optimized batch upsert
  public async upsertBatch(
    collection: string,
    points: Array<{ id: string, vector: number[], payload?: Record<string, unknown> }>
  ): Promise<void> {
    const startTime = Date.now();
    const context: LogContext = { component: 'QdrantOptimized', service: 'qdrant' };

    try {
      if (!this.client) {
         throw new Error('Qdrant client not initialized');
      }

      const batchSize = this.config.performance.batchSize;
      const batches: Array<Array<{ id: string, vector: number[], payload?: Record<string, unknown> }>> = [];

      for (let i = 0; i < points.length; i += batchSize) {
        batches.push(points.slice(i, i + batchSize));
      }

      let totalUpserted = 0;

      for (const batch of batches) {
        // Optimize using Float32Array where possible for internal handling
        // but Qdrant client typically expects number[]
        const batchPoints = batch.map(point => ({
          id: point.id,
          vector: point.vector,
          payload: point.payload
        }));

        await this.client.upsert(collection, {
            wait: true,
            points: batchPoints
        });

        // Update vector cache
        for (const point of batch) {
             this.updateVectorCache(point.id, new Float32Array(point.vector), point.payload, collection);
        }

        totalUpserted += batch.length;
      }

      const processingTime = Date.now() - startTime;

      this.logVectorOperation({
          timestamp: new Date().toISOString(),
          operation: 'batch_upsert',
          collection: collection,
          resultCount: totalUpserted,
          processingTime: processingTime
      });

      logger.info('Qdrant batch upsert completed', { ...context, totalUpserted, processingTime });

    } catch (error) {
       const errorMessage = error instanceof Error ? error.message : String(error);
       logger.error('Qdrant batch upsert failed', { ...context, errorMessage });
       throw error;
    }
  }

  // Vector cache management
  private updateVectorCache(
    id: string,
    vector: Float32Array,
    payload: Record<string, unknown> | undefined,
    collection: string
  ): void {
     const memoryFootprint = vector.byteLength + JSON.stringify(payload || {}).length;
     const entry: VectorCacheEntry = {
        id,
        vector,
        payload,
        timestamp: Date.now(),
        accessCount: 1,
        collection,
        memoryFootprint
     };

     const targetMemory = this.config.memoryLimits.vectorCacheSize * 1024;
     while (this.memoryUsage.vectorCache + memoryFootprint > targetMemory) {
       this.evictLeastUsedVector();
       if (this.vectorCache.size === 0) break;
     }

     this.vectorCache.set(id, entry);
     this.memoryUsage.vectorCache += memoryFootprint;
  }

  // Memory cleanup and optimization
  private cleanupMemory(): void {
    const startTime = Date.now();
    let cleaned = 0;
    const now = Date.now();

    const searchEntries = Array.from(this.searchCache.entries());
    for (const [key, entry] of searchEntries) {
      if (now - entry.timestamp > entry.ttl) {
        this.searchCache.delete(key);
        this.memoryUsage.searchCache -= entry.memorySize;
        cleaned++;
      }
    }

    const vectorEntries = Array.from(this.vectorCache.entries());
    for (const [key, entry] of vectorEntries) {
      if (now - entry.timestamp > 600000) { // 10 minutes
        this.vectorCache.delete(key);
        this.memoryUsage.vectorCache -= entry.memoryFootprint;
        cleaned++;
      }
    }

    this.memoryUsage.total = this.memoryUsage.vectorCache + this.memoryUsage.searchCache + this.memoryUsage.queryHistory;

    const cleanupTime = Date.now() - startTime;
    if (this.config.logging.memoryUsage && cleaned > 0) {
      logger.info('Memory cleanup completed', {
          component: 'QdrantOptimized',
          service: 'qdrant',
          entriesCleaned: cleaned,
          cleanupTime,
          memoryUsage: this.memoryUsage,
          cacheEfficiency: this.calculateCacheEfficiency()
      });
    }
  }

  // Performance metrics collection
  private collectMetrics(): void {
    const metrics = {
      performance: this.performanceMetrics,
      memoryUsage: this.memoryUsage,
      cacheStats: {
        vectorCache: this.vectorCache.size,
        searchCache: this.searchCache.size,
        queryHistory: this.queryHistory.length
      },
      efficiency: this.calculateCacheEfficiency()
    };

    if (this.config.logging.performanceMetrics) {
      logger.info('Qdrant performance metrics', {
        component: 'QdrantOptimized',
        service: 'qdrant',
        metrics
      });
    }
  }

  // Helper methods
  private generateQueryHash(collection: string, options?: string): string {
    const hashInput = JSON.stringify({ collection, options: options || '' });
    return this.generateHash(hashInput);
  }

  private generateHash(input: string) : string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private estimateResultMemory(results: any[]): number {
    try {
      const json = JSON.stringify(results);
      // Prefer Node's Buffer.byteLength when available
      const nodeBuffer = (globalThis as any).Buffer;
      if (typeof nodeBuffer !== 'undefined' && typeof nodeBuffer.byteLength === 'function') {
        return nodeBuffer.byteLength(json, 'utf8');
      } else {
        const TextEncoder = (globalThis as any).TextEncoder;
        if (typeof TextEncoder !== 'undefined') {
          return new TextEncoder().encode(json).length;
        }
        return json.length;
      }
    } catch {
      return 0;
    }
  }

  private estimateVectorMemory(
    points: Array<{ id: string, vector: number[], payload?: Record<string, unknown> }>
  ): number {
    return points.reduce((acc, point) => {
      const vec = point.vector;
      const vecLen = Array.isArray(vec) ? vec.length : 0;

      const payloadSize = (() => {
        try {
          return JSON.stringify(point?.payload || {}).length;
        } catch {
          return 0;
        }
      })();

      return acc + vecLen * 4 + payloadSize;
    }, 0);
  }

  private evictLeastUsedSearch(): void {
    let leastUsed: string | null = null;
    let minAccess = Infinity;
    let oldestTime = Date.now();

    const entries = Array.from(this.searchCache.entries());
    for (const [key, entry] of entries) {
      if (entry.accessCount < minAccess || (entry.accessCount === minAccess && entry.timestamp < oldestTime)) {
        leastUsed = key;
        minAccess = entry.accessCount;
        oldestTime = entry.timestamp;
      }
    }

    if (leastUsed) {
      const entry = this.searchCache.get(leastUsed)!;
      this.searchCache.delete(leastUsed);
      this.memoryUsage.searchCache -= entry.memorySize;
    }
  }

  private evictLeastUsedVector(): void {
    let leastUsed: string | null = null;
    let minAccess = Infinity;
    let oldestTime = Date.now();

    const entries = Array.from(this.vectorCache.entries());
    for (const [key, entry] of entries) {
      if (entry.accessCount < minAccess || (entry.accessCount === minAccess && entry.timestamp < oldestTime)) {
        leastUsed = key;
        minAccess = entry.accessCount;
        oldestTime = entry.timestamp;
      }
    }

    if (leastUsed) {
      const entry = this.vectorCache.get(leastUsed)!;
      this.vectorCache.delete(leastUsed);
      this.memoryUsage.vectorCache -= entry.memoryFootprint;
    }
  }

  private updateAverageLatency(latency: number): void {
    const totalQueries = this.performanceMetrics.totalQueries || 1;
    const currentAvg = this.performanceMetrics.averageLatency || 0;
    this.performanceMetrics.averageLatency = (currentAvg * Math.max(0, totalQueries - 1) + latency) / totalQueries;
  }

  private calculateCacheEfficiency(): number {
    const totalQueries = this.performanceMetrics.totalQueries;
    const cacheHits = this.performanceMetrics.cacheHits;
    return totalQueries > 0 ? (cacheHits / totalQueries) * 100 : 0;
  }

  // Helper: run a promise with a timeout to avoid hanging health checks
  private withTimeout<T>(promise: Promise<T>, ms = 3000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${ms}ms`));
      }, ms);

      promise
        .then(res => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  // Public API methods
  public async isHealthy(): Promise<boolean> {
    if (!this.client) return false;

    // Try different known client shapes with a short timeout
    const client = this.client as unknown as QdrantClientShapes;

    const tryChecks: Array<() => Promise<unknown>> = [
      // qdrant-js typical helper
      () => (client.getCollections ? client.getCollections() : Promise.reject('no-getCollections')),
      // alternative, collectionsApi / collections.get
      () => (client.collectionsApi?.getCollections ? client.collectionsApi.getCollections() : Promise.reject('no-collectionsApi')),
      () => (client.collections?.get ? client.collections.get() : Promise.reject('no-collections-get')),
      // some clients expose a health method
      () => (client.health ? client.health() : Promise.reject('no-health'))
    ];

    for (const check of tryChecks) {
      try {
        // guard each attempt with a timeout to avoid long hangs
        await this.withTimeout(check(), 2500);
        return true;
      } catch {
        // try next known shape
        continue;
      }
    }

    // If none of the known shapes worked, attempt a very conservative success:
    // if client exists but none of the helpers are available, consider it unhealthy.
    return false;
  }

  // Expose internal memory usage as a safe shallow copy
  public getMemoryUsage(): { vectorCache: number, searchCache: number, queryHistory: number, total: number } {
    return {
      vectorCache: this.memoryUsage.vectorCache,
      searchCache: this.memoryUsage.searchCache,
      queryHistory: this.memoryUsage.queryHistory,
      total: this.memoryUsage.total
    };
  }

  // Expose performance metrics as a safe shallow copy
  public getPerformanceMetrics(): { totalQueries: number, cacheHits: number, averageLatency: number, memoryEfficiency: number, errorRate: number } {
    return {
      totalQueries: this.performanceMetrics.totalQueries,
      cacheHits: this.performanceMetrics.cacheHits,
      averageLatency: this.performanceMetrics.averageLatency,
      memoryEfficiency: this.performanceMetrics.memoryEfficiency,
      errorRate: this.performanceMetrics.errorRate
    };
  }

  // Expose a copy of the query history (avoid exposing internal array reference)
  public getQueryHistory(): VectorCacheLogEntry[] {
    return this.queryHistory.slice();
  }

  public clearCaches(): void {
    this.vectorCache.clear();
    this.searchCache.clear();
    this.queryHistory.length = 0;
    this.memoryUsage = { vectorCache: 0, searchCache: 0, queryHistory: 0, total: 0 };

    // Try to clear the external caching service if available
    try {
      if (typeof cachingService.clear === 'function') {
        cachingService.clear();
      }
    } catch {
      // swallow errors from cache clearing; not fatal
    }
    logger.info('All caches cleared', { component: 'QdrantOptimized', service: 'qdrant' });
  }
}

// Singleton instance
export const optimizedQdrant = new OptimizedQdrantService();

// Backward compatibility exports (tightened types)
export const qdrantOptimized = {
  search: (
    collection: string,
    query: string | number[],
    options: { limit?: number; offset?: number; filter?: unknown; threshold?: number; useCache?: boolean } = {}
  ) => optimizedQdrant.search(collection, query, options),

  upsertBatch: (
    collection: string,
    points: Array<{ id: string, vector: number[], payload?: Record<string, unknown> }>
  ) => optimizedQdrant.upsertBatch(collection, points),

  isHealthy: () => optimizedQdrant.isHealthy(),
  getMemoryUsage: () => optimizedQdrant.getMemoryUsage(),
  getPerformanceMetrics: () => optimizedQdrant.getPerformanceMetrics(),
  getQueryHistory: () => optimizedQdrant.getQueryHistory(),
  clearCaches: () => optimizedQdrant.clearCaches()
};

export default optimizedQdrant;






