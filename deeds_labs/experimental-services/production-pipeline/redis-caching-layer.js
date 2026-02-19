/**
 * Redis Caching Layer
 * Multi-tier caching for crawl → OCR → embed → serve pipeline
 * Handles blob storage, search results, embeddings, and session data
 */

import Redis from 'ioredis';
import { EventEmitter } from 'events';

class RedisCachingLayer extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Redis connection
      host: config.host || 'localhost',
      port: config.port || 4005,
      db: config.db || 0,
      keyPrefix: config.keyPrefix || 'legal_ai:',
      
      // Cache policies
      ttl: {
        searchResults: config.ttl?.searchResults || 1800,    // 30 minutes
        embeddings: config.ttl?.embeddings || 86400,        // 24 hours
        documents: config.ttl?.documents || 3600,           // 1 hour
        blobs: config.ttl?.blobs || 7200,                   // 2 hours
        sessions: config.ttl?.sessions || 1800,             // 30 minutes
        metadata: config.ttl?.metadata || 43200             // 12 hours
      },
      
      // Memory limits (MB)
      maxMemory: config.maxMemory || 2048,
      evictionPolicy: config.evictionPolicy || 'allkeys-lru',
      
      // Compression
      compression: config.compression !== false,
      compressionThreshold: config.compressionThreshold || 1024, // bytes
      
      ...config
    };

    this.redis = null;
    this.isConnected = false;
    this.cacheStats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      memoryUsed: 0
    };
    
    // Cache key patterns
    this.keyPatterns = {
      search: 'search:*',
      embedding: 'embed:*',
      document: 'doc:*',
      blob: 'blob:*',
      session: 'session:*',
      metadata: 'meta:*',
      queue: 'queue:*',
      lock: 'lock:*'
    };
  }

  /**
   * Initialize Redis connection with optimized settings
   */
  async initialize() {
    try {
      console.log('🔄 Initializing Redis caching layer...');
      
      this.redis = new Redis({
        host: this.config.host,
        port: this.config.port,
        db: this.config.db,
        keyPrefix: this.config.keyPrefix,
        
        // Connection pool settings
        connectTimeout: 10000,
        commandTimeout: 5000,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        
        // Performance optimizations
        enableReadyCheck: true,
        maxLoadingTimeout: 0,
        
        // Error handling
        retryStrategyOnFailover: (times) => Math.min(times * 50, 2000)
      });

      // Event handlers
      this.redis.on('connect', () => {
        console.log('🔗 Connected to Redis');
        this.isConnected = true;
        this.emit('connected');
      });

      this.redis.on('ready', async () => {
        console.log('✅ Redis is ready');
        await this.configureRedis();
        this.emit('ready');
      });

      this.redis.on('error', (err) => {
        console.error('❌ Redis error:', err);
        this.isConnected = false;
        this.emit('error', err);
      });

      this.redis.on('close', () => {
        console.log('⚠️ Redis connection closed');
        this.isConnected = false;
        this.emit('disconnected');
      });

      // Connect
      await this.redis.connect();
      console.log('✅ Redis caching layer initialized');
      
    } catch (error) {
      console.error('❌ Redis initialization failed:', error);
      throw error;
    }
  }

  /**
   * Configure Redis for optimal caching performance
   */
  async configureRedis() {
    try {
      // Set memory policy
      await this.redis.config('SET', 'maxmemory-policy', this.config.evictionPolicy);
      
      if (this.config.maxMemory > 0) {
        await this.redis.config('SET', 'maxmemory', `${this.config.maxMemory}mb`);
      }

      // Enable keyspace notifications for cache events
      await this.redis.config('SET', 'notify-keyspace-events', 'Ex');
      
      // Optimize for performance
      await this.redis.config('SET', 'hash-max-ziplist-entries', '512');
      await this.redis.config('SET', 'hash-max-ziplist-value', '64');
      await this.redis.config('SET', 'list-max-ziplist-size', '-2');
      await this.redis.config('SET', 'set-max-intset-entries', '512');
      
      console.log('⚙️ Redis configuration optimized');
      
    } catch (error) {
      console.warn('⚠️ Redis configuration warning:', error.message);
    }
  }

  /**
   * Generic cache operations with compression and TTL
   */

  async set(key, value, ttl = null) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    try {
      let data = value;
      let compressed = false;

      // Serialize non-string values
      if (typeof value !== 'string') {
        data = JSON.stringify(value);
      }

      // Compress large values
      if (this.config.compression && data.length > this.config.compressionThreshold) {
        data = await this.compress(data);
        compressed = true;
      }

      // Prepare cache entry
      const cacheEntry = {
        data,
        compressed,
        timestamp: Date.now(),
        type: typeof value
      };

      const serialized = JSON.stringify(cacheEntry);
      const finalTtl = ttl || this.config.ttl.documents;

      if (finalTtl > 0) {
        await this.redis.setex(key, finalTtl, serialized);
      } else {
        await this.redis.set(key, serialized);
      }

      this.cacheStats.sets++;
      this.emit('cache_set', { key, size: serialized.length, ttl: finalTtl });

      return true;

    } catch (error) {
      console.error('❌ Cache set failed:', error);
      throw error;
    }
  }

  async get(key) {
    if (!this.isConnected) {
      return null;
    }

    try {
      const cached = await this.redis.get(key);
      
      if (!cached) {
        this.cacheStats.misses++;
        this.emit('cache_miss', { key });
        return null;
      }

      const cacheEntry = JSON.parse(cached);
      let data = cacheEntry.data;

      // Decompress if needed
      if (cacheEntry.compressed) {
        data = await this.decompress(data);
      }

      // Parse based on original type
      let result = data;
      if (cacheEntry.type === 'object') {
        result = JSON.parse(data);
      } else if (cacheEntry.type === 'number') {
        result = Number(data);
      } else if (cacheEntry.type === 'boolean') {
        result = data === 'true';
      }

      this.cacheStats.hits++;
      this.emit('cache_hit', { key, age: Date.now() - cacheEntry.timestamp });

      return result;

    } catch (error) {
      console.error('❌ Cache get failed:', error);
      this.cacheStats.misses++;
      return null;
    }
  }

  async delete(key) {
    if (!this.isConnected) return 0;
    
    const deleted = await this.redis.del(key);
    this.cacheStats.deletes++;
    this.emit('cache_delete', { key });
    return deleted;
  }

  async exists(key) {
    if (!this.isConnected) return false;
    return (await this.redis.exists(key)) === 1;
  }

  /**
   * Specialized caching methods for pipeline data
   */

  // Search result caching
  async cacheSearchResults(query, results, filters = {}) {
    const cacheKey = this.generateSearchKey(query, filters);
    
    await this.set(cacheKey, {
      query,
      results,
      filters,
      resultCount: results.length,
      timestamp: new Date().toISOString()
    }, this.config.ttl.searchResults);

    console.log(`💾 Cached search results: ${results.length} results for "${query}"`);
    return cacheKey;
  }

  async getCachedSearchResults(query, filters = {}) {
    const cacheKey = this.generateSearchKey(query, filters);
    const cached = await this.get(cacheKey);
    
    if (cached) {
      console.log(`⚡ Cache hit for search: "${query}" (${cached.resultCount} results)`);
      return cached;
    }
    
    return null;
  }

  // Embedding caching
  async cacheEmbeddings(documentId, embeddings, metadata = {}) {
    const cacheKey = `embed:${documentId}`;
    
    await this.set(cacheKey, {
      documentId,
      embeddings,
      metadata,
      vectorCount: embeddings.length,
      dimensions: embeddings[0]?.length || 0
    }, this.config.ttl.embeddings);

    console.log(`🧠 Cached embeddings: ${embeddings.length} vectors for doc ${documentId}`);
  }

  async getCachedEmbeddings(documentId) {
    const cacheKey = `embed:${documentId}`;
    const cached = await this.get(cacheKey);
    
    if (cached) {
      console.log(`⚡ Cache hit for embeddings: doc ${documentId} (${cached.vectorCount} vectors)`);
    }
    
    return cached;
  }

  // Document blob caching
  async cacheBlobData(blobId, data, contentType, metadata = {}) {
    const cacheKey = `blob:${blobId}`;
    
    await this.set(cacheKey, {
      blobId,
      data: Buffer.isBuffer(data) ? data.toString('base64') : data,
      contentType,
      metadata,
      size: data.length || 0
    }, this.config.ttl.blobs);

    console.log(`📄 Cached blob: ${blobId} (${data.length || 0} bytes)`);
  }

  async getCachedBlobData(blobId) {
    const cacheKey = `blob:${blobId}`;
    const cached = await this.get(cacheKey);
    
    if (cached) {
      console.log(`⚡ Cache hit for blob: ${blobId} (${cached.size} bytes)`);
      
      // Convert base64 back to buffer if needed
      if (cached.contentType?.startsWith('image/') || cached.contentType?.startsWith('application/')) {
        cached.data = Buffer.from(cached.data, 'base64');
      }
    }
    
    return cached;
  }

  // Document metadata caching
  async cacheDocumentMetadata(documentId, metadata) {
    const cacheKey = `meta:${documentId}`;
    
    await this.set(cacheKey, {
      documentId,
      metadata,
      lastUpdated: new Date().toISOString()
    }, this.config.ttl.metadata);

    console.log(`📋 Cached metadata for doc: ${documentId}`);
  }

  async getCachedDocumentMetadata(documentId) {
    const cacheKey = `meta:${documentId}`;
    return await this.get(cacheKey);
  }

  // Session caching
  async cacheSession(sessionId, sessionData) {
    const cacheKey = `session:${sessionId}`;
    
    await this.set(cacheKey, {
      sessionId,
      data: sessionData,
      lastAccess: new Date().toISOString()
    }, this.config.ttl.sessions);
  }

  async getCachedSession(sessionId) {
    const cacheKey = `session:${sessionId}`;
    return await this.get(cacheKey);
  }

  /**
   * Cache invalidation and cleanup
   */

  async invalidatePattern(pattern) {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        const deleted = await this.redis.del(...keys);
        console.log(`🧹 Invalidated ${deleted} keys matching: ${pattern}`);
        return deleted;
      }
      return 0;
    } catch (error) {
      console.error('❌ Pattern invalidation failed:', error);
      return 0;
    }
  }

  async invalidateDocument(documentId) {
    const patterns = [
      `embed:${documentId}`,
      `meta:${documentId}`,
      `blob:${documentId}*`,
      `search:*${documentId}*`
    ];

    let totalDeleted = 0;
    for (const pattern of patterns) {
      totalDeleted += await this.invalidatePattern(pattern);
    }

    console.log(`🗑️ Invalidated ${totalDeleted} entries for document: ${documentId}`);
    return totalDeleted;
  }

  async invalidateSearchCache() {
    return await this.invalidatePattern('search:*');
  }

  /**
   * Cache warming and preloading
   */

  async warmSearchCache(popularQueries = []) {
    console.log('🔥 Warming search cache...');
    
    for (const query of popularQueries) {
      // This would be implemented with your actual search service
      console.log(`  Preloading: "${query}"`);
      // await this.cacheSearchResults(query, await searchService.search(query));
    }
  }

  async preloadDocumentCache(documentIds = []) {
    console.log('📚 Preloading document cache...');
    
    for (const docId of documentIds) {
      console.log(`  Preloading doc: ${docId}`);
      // Implementation would load from primary storage
    }
  }

  /**
   * Distributed locking for cache coordination
   */

  async acquireLock(resource, ttl = 30000) {
    const lockKey = `lock:${resource}`;
    const lockValue = `${Date.now()}_${Math.random()}`;
    
    const acquired = await this.redis.set(
      lockKey,
      lockValue,
      'PX', // Milliseconds
      ttl,
      'NX' // Only if not exists
    );

    if (acquired === 'OK') {
      return { lockKey, lockValue, ttl };
    }
    
    return null;
  }

  async releaseLock(lockKey, lockValue) {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    return await this.redis.eval(script, 1, lockKey, lockValue);
  }

  /**
   * Cache analytics and monitoring
   */

  async getCacheStats() {
    try {
      const info = await this.redis.info('memory');
      const keyspace = await this.redis.info('keyspace');
      
      // Parse memory info
      const memoryUsed = this.extractStat(info, 'used_memory_human');
      const memoryPeak = this.extractStat(info, 'used_memory_peak_human');
      const fragmentation = this.extractStat(info, 'mem_fragmentation_ratio');
      
      // Parse keyspace info
      const dbInfo = this.extractStat(keyspace, 'db0');
      let keyCount = 0, expiredCount = 0;
      
      if (dbInfo) {
        const match = dbInfo.match(/keys=(\d+),expires=(\d+)/);
        if (match) {
          keyCount = parseInt(match[1]);
          expiredCount = parseInt(match[2]);
        }
      }

      return {
        ...this.cacheStats,
        hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) || 0,
        memoryUsed,
        memoryPeak,
        fragmentation: parseFloat(fragmentation) || 0,
        keyCount,
        expiredCount,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Failed to get cache stats:', error);
      return this.cacheStats;
    }
  }

  async getTopKeys(limit = 10) {
    try {
      // This is a simplified version - in production you'd want more sophisticated monitoring
      const patterns = Object.values(this.keyPatterns);
      const results = {};
      
      for (const pattern of patterns) {
        const keys = await this.redis.keys(pattern);
        results[pattern] = {
          count: keys.length,
          samples: keys.slice(0, 3)
        };
      }
      
      return results;
    } catch (error) {
      console.error('❌ Failed to get top keys:', error);
      return {};
    }
  }

  /**
   * Utility methods
   */

  generateSearchKey(query, filters = {}) {
    const filterStr = Object.keys(filters)
      .sort()
      .map(k => `${k}:${filters[k]}`)
      .join('|');
      
    const queryHash = Buffer.from(`${query}:${filterStr}`).toString('base64').slice(0, 32);
    return `search:${queryHash}`;
  }

  extractStat(info, key) {
    const match = info.match(new RegExp(`${key}:([^\\r\\n]+)`));
    return match ? match[1] : null;
  }

  async compress(data) {
    // Simple compression - in production you might use zlib
    return Buffer.from(data).toString('base64');
  }

  async decompress(data) {
    return Buffer.from(data, 'base64').toString();
  }

  /**
   * Health check
   */

  async healthCheck() {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;
      
      const stats = await this.getCacheStats();
      
      return {
        status: 'healthy',
        latency,
        connected: this.isConnected,
        stats
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        connected: false
      };
    }
  }

  /**
   * Cleanup
   */

  async cleanup() {
    console.log('🧹 Cleaning up Redis caching layer...');
    
    if (this.redis) {
      await this.redis.quit();
    }
    
    this.isConnected = false;
    console.log('✅ Redis cleanup completed');
  }
}

// Export the main class
export default RedisCachingLayer;

// Export convenience factory function
export function createCacheLayer(config = {}) {
  return new RedisCachingLayer(config);
}