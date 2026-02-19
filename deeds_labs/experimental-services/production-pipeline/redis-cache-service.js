#!/usr/bin/env node

/**
 * Redis Cache Service for PostgreSQL + pgvector + Drizzle ORM
 * Optimized caching layer for legal AI document pipeline
 */

import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';

export class RedisCacheService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 4005, // Your Redis port
      password: config.password || null,
      db: config.db || 0,
      keyPrefix: config.keyPrefix || 'legal_ai:',
      defaultTTL: config.defaultTTL || 3600, // 1 hour
      maxRetries: config.maxRetries || 3,
      retryDelayOnFailover: config.retryDelayOnFailover || 100
    };

    this.redis = null;
    this.isConnected = false;
    
    // Cache key patterns
    this.keys = {
      // Document caching
      document: (id) => `${this.config.keyPrefix}doc:${id}`,
      documentMetadata: (id) => `${this.config.keyPrefix}doc:meta:${id}`,
      documentChunks: (id) => `${this.config.keyPrefix}doc:chunks:${id}`,
      documentEmbedding: (id) => `${this.config.keyPrefix}doc:embed:${id}`,
      
      // Search results caching
      searchResults: (query) => `${this.config.keyPrefix}search:${this.hashQuery(query)}`,
      vectorSearch: (embedding, threshold) => `${this.config.keyPrefix}vector:${this.hashVector(embedding, threshold)}`,
      
      // Processing status
      jobStatus: (jobId) => `${this.config.keyPrefix}job:${jobId}`,
      processingQueue: (type) => `${this.config.keyPrefix}queue:${type}`,
      
      // Legal analysis cache
      legalAnalysis: (docId, analysisType) => `${this.config.keyPrefix}legal:${analysisType}:${docId}`,
      caseRelations: (docId) => `${this.config.keyPrefix}relations:${docId}`,
      
      // Performance metrics
      stats: (metric) => `${this.config.keyPrefix}stats:${metric}`,
      healthCheck: () => `${this.config.keyPrefix}health:${Date.now()}`
    };
  }

  async connect() {
    try {
      console.log(`🔌 Connecting to Redis at ${this.config.host}:${this.config.port}`);
      
      this.redis = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        maxRetriesPerRequest: this.config.maxRetries,
        retryDelayOnFailover: this.config.retryDelayOnFailover,
        enableReadyCheck: true,
        maxLoadingTimeout: 5000
      });

      this.redis.on('connect', () => {
        console.log('🔌 Redis connecting...');
      });

      this.redis.on('ready', () => {
        this.isConnected = true;
        console.log('✅ Redis connected and ready');
        this.emit('connected');
      });

      this.redis.on('error', (err) => {
        console.error('❌ Redis error:', err.message);
        this.isConnected = false;
        this.emit('error', err);
      });

      this.redis.on('close', () => {
        this.isConnected = false;
        console.log('🔌 Redis connection closed');
        this.emit('disconnected');
      });

      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
        this.redis.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });
        this.redis.once('error', reject);
      });

    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error.message);
      throw error;
    }
  }

  hashQuery(query) {
    return createHash('sha256').update(JSON.stringify(query)).digest('hex').substring(0, 16);
  }

  hashVector(embedding, threshold) {
    const data = { embedding: embedding.slice(0, 10), threshold }; // Sample first 10 dimensions
    return createHash('sha256').update(JSON.stringify(data)).digest('hex').substring(0, 16);
  }

  // Document caching methods
  async cacheDocument(documentId, document, ttl = this.config.defaultTTL) {
    if (!this.isConnected) return false;
    
    try {
      const key = this.keys.document(documentId);
      await this.redis.setex(key, ttl, JSON.stringify(document));
      console.log(`📄 Cached document ${documentId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to cache document ${documentId}:`, error.message);
      return false;
    }
  }

  async getDocument(documentId) {
    if (!this.isConnected) return null;
    
    try {
      const key = this.keys.document(documentId);
      const cached = await this.redis.get(key);
      if (cached) {
        console.log(`🎯 Cache hit for document ${documentId}`);
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      console.error(`❌ Failed to get cached document ${documentId}:`, error.message);
      return null;
    }
  }

  async cacheDocumentEmbeddings(documentId, embeddings, ttl = this.config.defaultTTL * 2) {
    if (!this.isConnected) return false;
    
    try {
      const key = this.keys.documentEmbedding(documentId);
      // Store as binary buffer for efficiency
      const buffer = Buffer.from(new Float32Array(embeddings.flat()).buffer);
      await this.redis.setex(key, ttl, buffer);
      console.log(`🧠 Cached embeddings for document ${documentId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to cache embeddings for ${documentId}:`, error.message);
      return false;
    }
  }

  async getDocumentEmbeddings(documentId) {
    if (!this.isConnected) return null;
    
    try {
      const key = this.keys.documentEmbedding(documentId);
      const buffer = await this.redis.getBuffer(key);
      if (buffer) {
        console.log(`🎯 Cache hit for embeddings ${documentId}`);
        return new Float32Array(buffer.buffer);
      }
      return null;
    } catch (error) {
      console.error(`❌ Failed to get cached embeddings ${documentId}:`, error.message);
      return null;
    }
  }

  // Search results caching
  async cacheSearchResults(query, results, ttl = 1800) { // 30 minutes
    if (!this.isConnected) return false;
    
    try {
      const key = this.keys.searchResults(query);
      const cacheData = {
        query,
        results,
        timestamp: Date.now(),
        count: results.length
      };
      await this.redis.setex(key, ttl, JSON.stringify(cacheData));
      console.log(`🔍 Cached search results for query hash ${this.hashQuery(query)}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to cache search results:`, error.message);
      return false;
    }
  }

  async getSearchResults(query, maxAge = 1800000) { // 30 minutes in ms
    if (!this.isConnected) return null;
    
    try {
      const key = this.keys.searchResults(query);
      const cached = await this.redis.get(key);
      if (cached) {
        const data = JSON.parse(cached);
        const age = Date.now() - data.timestamp;
        if (age <= maxAge) {
          console.log(`🎯 Cache hit for search query (${data.count} results, ${Math.round(age/1000)}s old)`);
          return data.results;
        } else {
          // Expired, remove it
          await this.redis.del(key);
        }
      }
      return null;
    } catch (error) {
      console.error(`❌ Failed to get cached search results:`, error.message);
      return null;
    }
  }

  // Vector search caching (for expensive pgvector operations)
  async cacheVectorSearch(embedding, threshold, results, ttl = 900) { // 15 minutes
    if (!this.isConnected) return false;
    
    try {
      const key = this.keys.vectorSearch(embedding, threshold);
      const cacheData = {
        threshold,
        results: results.map(r => ({
          id: r.id,
          score: r.score,
          metadata: r.metadata
        })),
        timestamp: Date.now(),
        count: results.length
      };
      await this.redis.setex(key, ttl, JSON.stringify(cacheData));
      console.log(`🧠 Cached vector search results (${results.length} matches, threshold: ${threshold})`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to cache vector search:`, error.message);
      return false;
    }
  }

  async getVectorSearchResults(embedding, threshold, maxAge = 900000) { // 15 minutes in ms
    if (!this.isConnected) return null;
    
    try {
      const key = this.keys.vectorSearch(embedding, threshold);
      const cached = await this.redis.get(key);
      if (cached) {
        const data = JSON.parse(cached);
        const age = Date.now() - data.timestamp;
        if (age <= maxAge && Math.abs(data.threshold - threshold) < 0.001) {
          console.log(`🎯 Vector search cache hit (${data.count} results, ${Math.round(age/1000)}s old)`);
          return data.results;
        } else {
          await this.redis.del(key);
        }
      }
      return null;
    } catch (error) {
      console.error(`❌ Failed to get cached vector search:`, error.message);
      return null;
    }
  }

  // Job status tracking
  async setJobStatus(jobId, status, data = {}) {
    if (!this.isConnected) return false;
    
    try {
      const key = this.keys.jobStatus(jobId);
      const statusData = {
        status,
        data,
        updatedAt: Date.now()
      };
      await this.redis.setex(key, 7200, JSON.stringify(statusData)); // 2 hours
      console.log(`📋 Updated job status ${jobId}: ${status}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to set job status ${jobId}:`, error.message);
      return false;
    }
  }

  async getJobStatus(jobId) {
    if (!this.isConnected) return null;
    
    try {
      const key = this.keys.jobStatus(jobId);
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error(`❌ Failed to get job status ${jobId}:`, error.message);
      return null;
    }
  }

  // Legal analysis caching
  async cacheLegalAnalysis(documentId, analysisType, analysis, ttl = 7200) { // 2 hours
    if (!this.isConnected) return false;
    
    try {
      const key = this.keys.legalAnalysis(documentId, analysisType);
      const analysisData = {
        documentId,
        analysisType,
        analysis,
        timestamp: Date.now()
      };
      await this.redis.setex(key, ttl, JSON.stringify(analysisData));
      console.log(`⚖️ Cached legal analysis ${analysisType} for document ${documentId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to cache legal analysis:`, error.message);
      return false;
    }
  }

  async getLegalAnalysis(documentId, analysisType) {
    if (!this.isConnected) return null;
    
    try {
      const key = this.keys.legalAnalysis(documentId, analysisType);
      const cached = await this.redis.get(key);
      if (cached) {
        const data = JSON.parse(cached);
        console.log(`🎯 Cache hit for legal analysis ${analysisType}`);
        return data.analysis;
      }
      return null;
    } catch (error) {
      console.error(`❌ Failed to get cached legal analysis:`, error.message);
      return null;
    }
  }

  // Batch operations
  async cacheMultiple(items, ttl = this.config.defaultTTL) {
    if (!this.isConnected) return false;
    
    try {
      const pipeline = this.redis.pipeline();
      
      for (const { key, value } of items) {
        pipeline.setex(key, ttl, JSON.stringify(value));
      }
      
      await pipeline.exec();
      console.log(`📦 Batch cached ${items.length} items`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to batch cache:`, error.message);
      return false;
    }
  }

  async getMultiple(keys) {
    if (!this.isConnected) return {};
    
    try {
      const values = await this.redis.mget(...keys);
      const results = {};
      
      keys.forEach((key, index) => {
        if (values[index]) {
          try {
            results[key] = JSON.parse(values[index]);
          } catch {
            results[key] = values[index];
          }
        }
      });
      
      const hitCount = Object.keys(results).length;
      console.log(`🎯 Batch cache: ${hitCount}/${keys.length} hits`);
      return results;
    } catch (error) {
      console.error(`❌ Failed to get multiple keys:`, error.message);
      return {};
    }
  }

  // Cache invalidation
  async invalidateDocument(documentId) {
    if (!this.isConnected) return false;
    
    try {
      const keys = [
        this.keys.document(documentId),
        this.keys.documentMetadata(documentId),
        this.keys.documentChunks(documentId),
        this.keys.documentEmbedding(documentId),
        this.keys.caseRelations(documentId)
      ];
      
      const deleted = await this.redis.del(...keys);
      console.log(`🗑️ Invalidated ${deleted} cache entries for document ${documentId}`);
      return deleted > 0;
    } catch (error) {
      console.error(`❌ Failed to invalidate document cache:`, error.message);
      return false;
    }
  }

  async invalidateSearchCache() {
    if (!this.isConnected) return false;
    
    try {
      const searchKeys = await this.redis.keys(`${this.config.keyPrefix}search:*`);
      const vectorKeys = await this.redis.keys(`${this.config.keyPrefix}vector:*`);
      
      if (searchKeys.length > 0 || vectorKeys.length > 0) {
        const deleted = await this.redis.del(...searchKeys, ...vectorKeys);
        console.log(`🗑️ Invalidated ${deleted} search cache entries`);
        return deleted;
      }
      return 0;
    } catch (error) {
      console.error(`❌ Failed to invalidate search cache:`, error.message);
      return false;
    }
  }

  // Health and monitoring
  async healthCheck() {
    if (!this.isConnected) return { status: 'disconnected' };
    
    try {
      const start = Date.now();
      const testKey = this.keys.healthCheck();
      await this.redis.set(testKey, 'ok', 'EX', 10);
      const testValue = await this.redis.get(testKey);
      await this.redis.del(testKey);
      const latency = Date.now() - start;
      
      const info = await this.redis.info('memory');
      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      const memory = memoryMatch ? memoryMatch[1] : 'unknown';
      
      return {
        status: testValue === 'ok' ? 'healthy' : 'error',
        latency,
        memory,
        connected: this.isConnected
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        connected: this.isConnected
      };
    }
  }

  async getStats() {
    if (!this.isConnected) return null;
    
    try {
      const info = await this.redis.info();
      const lines = info.split('\r\n');
      const stats = {};
      
      lines.forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      });
      
      return {
        ...stats,
        keyPrefix: this.config.keyPrefix,
        connection: {
          host: this.config.host,
          port: this.config.port,
          connected: this.isConnected
        }
      };
    } catch (error) {
      console.error('❌ Failed to get Redis stats:', error.message);
      return null;
    }
  }

  async close() {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
    this.isConnected = false;
    console.log('🔌 Redis connection closed');
  }
}

// CLI usage
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const cache = new RedisCacheService({
    port: 4005,
    keyPrefix: 'legal_ai_test:'
  });

  cache.on('connected', async () => {
    try {
      // Test document caching
      await cache.cacheDocument('test123', { title: 'Test Document', content: 'Legal content...' });
      const doc = await cache.getDocument('test123');
      console.log('📄 Cached document:', doc?.title);

      // Test search caching
      await cache.cacheSearchResults({ query: 'legal contracts' }, [{ id: 1, title: 'Contract 1' }]);
      const results = await cache.getSearchResults({ query: 'legal contracts' });
      console.log('🔍 Cached search:', results?.length, 'results');

      // Health check
      const health = await cache.healthCheck();
      console.log('🏥 Health:', health);

      await cache.close();
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

  await cache.connect();
}

export default RedisCacheService;