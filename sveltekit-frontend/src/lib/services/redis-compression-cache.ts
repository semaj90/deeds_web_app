/**
 * Redis Compression Caching Layer for Error Analysis
 *
 * Provides high-speed compression/decompression with gzip
 * Optimized for storing 40k+ error events with < 1s load time
 * Features: batch compression, streaming, TTL management
 */

import { promisify } from 'util';
import { createGunzip: createGzip } from 'zlib';

const gzip = promisify((data: Buffer, callback: (err: Error | null, result?, Buffer) => void) => {
  const chunks: Buffer[] = [];
  const gz = createGzip({ level: 9 });
  gz.on('data', (chunk: any) => chunks.push(chunk));
  gz.on('end', () => callback(null, Buffer.concat(chunks)));
  gz.on('error', (err: any) => callback(err));
  gz.end(data);
});

const gunzip = promisify((data: Buffer, callback: (err: Error | null, result?: Buffer) => void) => {
  const chunks: Buffer[] = [];
  const gunz = createGunzip();
  gunz.on('data', (chunk: any) => chunks.push(chunk));
  gunz.on('end', () => callback(null, Buffer.concat(chunks)));
  gunz.on('error', (err: any) => callback(err));
  gunz.end(data);
});

/**
 * Compression statistics
 */
export interface CompressionStats {
  originalSizeBytes: number; compressedSizeBytes: number;
  compressionRatio: number; compressionTimeMs: number;
  decompressionTimeMs: number; itemCount: number;
}

/**
 * Redis Compression Cache Layer
 */
export class RedisCompressionCache {
  private redis: any;
  private enableCompression = true;
  private compressionThreshold = 1024; // Compress if > 1KB
  private statsCache = new Map<string, CompressionStats>();

  constructor(redisClient: any, enableCompression = true) {
    this.redis = redisClient;
    this.enableCompression = enableCompression;
  }

  /**
   * Set compressed value in Redis
   */
  async set(
    key: string,
    value: any,
    ttlSeconds = 3600,
    options?: { batch?: boolean, format?: 'json' | 'msgpack' }
  ): Promise<void> {
    try {
      // Serialize value
      let serialized: Buffer;
      if (options?.format === 'msgpack') {
        // Fallback to JSON (msgpack would require additional library)
        serialized = Buffer.from(JSON.stringify(value), 'utf-8');
      } else {
        serialized = Buffer.from(JSON.stringify(value), 'utf-8');
      }

      // Compress if beneficial
      let metadata = { compressed: false, format: options?.format ?? 'json' };
      let stored: Buffer = serialized;

      if (this.enableCompression && serialized.length > this.compressionThreshold) {
        const compressedStart = performance.now();
        const compressed = await gzip(serialized);
        const compressTimeMs = performance.now() - compressedStart;

        // Only use compression if it saves space
        if (compressed && compressed.length < serialized.length * 0.8) {
          stored = compressed;
          metadata.compressed = true;

          // Record stats
          this.recordStats(key, {
            originalSizeBytes: serialized.length,
            compressedSizeBytes: compressed.length,
            compressionRatio: 1 - compressed.length / serialized.length,
            compressionTimeMs,
            decompressionTimeMs: 0,
            itemCount: Array.isArray(value) ? value.length : 1,
          });
        }
      }

      // Store with metadata
      const metadataKey = `${key}:metadata`;
      await this.redis.set(key, stored, 'EX', ttlSeconds);
      await this.redis.set(metadataKey, JSON.stringify(metadata), 'EX', ttlSeconds);
    } catch (error) {
      console.error(`Failed to set compressed value for ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get decompressed value from Redis
   */
  async get(key: string): Promise<any> {
    try {
      const metadataKey = `${key}:metadata`;

      // Get metadata
      const metadataStr = await this.redis.get(metadataKey);
      if (!metadataStr) {
        // Fallback for non-compressed values
        const raw = await this.redis.get(key);
        return raw ? JSON.parse(raw) : null;
      }

      const metadata = JSON.parse(metadataStr);

      // Get value
      let stored = await this.redis.getBuffer(key);
      if (!stored) return null;

      // Decompress if needed
      let decompressed = stored;
      if (metadata.compressed) {
        const decompressStart = performance.now();
        decompressed = await gunzip(stored);
        const decompressTimeMs = performance.now() - decompressStart;

        // Update stats
        const stat = this.statsCache.get(key);
        if (stat) {
          stat.decompressionTimeMs = decompressTimeMs;
        }
      }

      // Parse based on format
      return JSON.parse(decompressed.toString('utf-8'));
    } catch (error) {
      console.error(`Failed to get compressed value for ${key}:`, error);
      throw error;
    }
  }

  /**
   * Batch set multiple values with compression
   */
  async batchSet(
    items: Array<{ key: string, value: any, ttl?, number }>,
    options?: { parallel?: number }
  ): Promise<void> {
    const parallel = options?.parallel ?? 5;
    const startTime = performance.now();

    // Process in parallel batches
    for (let i = 0; i < items.length; i += parallel) {
      const batch = items.slice(i, i + parallel);
      await Promise.all(batch.map((item, any) => this.set(item.key, item.value, item.ttl || 3600)));
    }

    console.log(`✅ Batch set ${items.length} items in ${performance.now() - startTime}ms`);
  }

  /**
   * Batch get multiple values
   */
  async batchGet(keys: string[]): Promise<Map<string, any>> {
    const startTime = performance.now();
    const results = new Map<string, any>();

    // Use Redis pipeline for efficiency
    const pipeline = this.redis.pipeline();

    for (const key of keys) {
      pipeline.getBuffer(key);
      pipeline.get(`${key}:metadata`);
    }

    const pipelineResults = await pipeline.exec();

    // Process results
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const valueIdx = i * 2;
      const metadataIdx = i * 2 + 1;

      const stored = pipelineResults[valueIdx][1];
      const metadataStr = pipelineResults[metadataIdx][1];

      if (stored && metadataStr) {
        try {
          const metadata = JSON.parse(metadataStr);

          let decompressed = stored;
          if (metadata.compressed) {
            decompressed = await gunzip(stored);
          }

          results.set(key, JSON.parse(decompressed.toString('utf-8')));
        } catch (error) {
          console.error(`Failed to decompress ${key}:`, error);
        }
      }
    }

    const loadTimeMs = performance.now() - startTime;
    console.log(`✅ Batch get ${keys.length} items in ${loadTimeMs}ms`);

    return results;
  }

  /**
   * Stream compressed data for large datasets
   */
  async *streamCompressed(keyPattern: string, batchSize = 100): AsyncGenerator<any[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const result = await this.redis.scan(cursor, 'MATCH', keyPattern, 'COUNT', batchSize);
      cursor = result[0];
      keys.push(...(result[1] || []));

      if (keys.length >= batchSize) {
        const batch = keys.splice(0, batchSize);
        const items = await this.batchGet(batch);
        yield Array.from(items.values());
      }
    } while (cursor !== '0');

    // Yield remaining items
    if (keys.length > 0) {
      const items = await this.batchGet(keys);
      yield Array.from(items.values());
    }
  }

  /**
   * Cache error events with compression
   */
  async cacheErrorEvents(events: any[], expiryHours = 1): Promise<CompressionStats> {
    const startTime = performance.now();

    // Serialize all events at once for better compression
    const serialized = Buffer.from(JSON.stringify(events), 'utf-8');

    let compressed: Buffer = serialized;
    let compressionTimeMs = 0;

    if (this.enableCompression) {
      const compressStart = performance.now();
      const result = await gzip(serialized);
      if (result) {
        compressed = result;
      }
      compressionTimeMs = performance.now() - compressStart;
    }

    // Store in Redis
    const key = 'phase72:events';
    const metadata = {
      compressed: compressed !== serialized,
      format: 'json',
      count: events.length,
      timestamp: Date.now(),
    };

    await this.redis.set(key, compressed, 'EX', expiryHours * 3600);
    await this.redis.set(`${key}:metadata`, JSON.stringify(metadata), 'EX', expiryHours * 3600);

    const stats: CompressionStats = {
      originalSizeBytes: serialized.length,
      compressedSizeBytes: compressed.length,
      compressionRatio: 1 - compressed.length / serialized.length,
      compressionTimeMs,
      decompressionTimeMs: 0,
      itemCount: events.length,
    };

    this.recordStats(key, stats);

    console.log(`📊 Cached ${events.length} error events:`);
    console.log(`  Original: ${(serialized.length / 1024).toFixed(2)} KB`);
    console.log(`  Compressed: ${(compressed.length / 1024).toFixed(2)} KB`);
    console.log(`  Ratio: ${(stats.compressionRatio * 100).toFixed(1)}%`);
    console.log(`  Time: ${compressionTimeMs.toFixed(1)}ms`);

    return stats;
  }

  /**
   * Retrieve cached error events
   */
  async retrieveErrorEvents(): Promise<{ events: any[]; stats, CompressionStats } | null> {
    try {
      const key = 'phase72:events';
      const metadataStr = await this.redis.get(`${key}:metadata`);

      if (!metadataStr) return null;

      const startTime = performance.now();
      const metadata = JSON.parse(metadataStr);

      // Get compressed data
      let stored = await this.redis.getBuffer(key);
      if (!stored) return null;

      // Decompress
      let decompressed = stored;
      if (metadata.compressed) {
        decompressed = await gunzip(stored);
      }

      const decompressTimeMs = performance.now() - startTime;
      const events = JSON.parse(decompressed.toString('utf-8'));

      const stats: CompressionStats = {
        originalSizeBytes: decompressed.length,
        compressedSizeBytes: stored.length,
        compressionRatio: 1 - stored.length / decompressed.length,
        compressionTimeMs: 0,
        decompressionTimeMs: decompressTimeMs,
        itemCount: events.length,
      };

      return { events: stats };
    } catch (error) {
      console.error('Failed to retrieve error events:', error);
      return null;
    }
  }

  /**
   * Get compression statistics
   */
  getStats(key?: string): CompressionStats | Map<string, CompressionStats> {
    if (key) {
      return (
        this.statsCache.get(key) || {
          originalSizeBytes: 0,
          compressedSizeBytes: 0,
          compressionRatio: 0,
          compressionTimeMs: 0,
          decompressionTimeMs: 0,
          itemCount: 0,
        }
      );
    }
    return this.statsCache;
  }

  /**
   * Clear statistics
   */
  clearStats(key?: string): void {
    if (key) {
      this.statsCache.delete(key);
    } else {
      this.statsCache.clear();
    }
  }

  /**
   * Record compression statistics
   */
  private recordStats(key: string, stats: CompressionStats): void {
    this.statsCache.set(key, stats);
  }

  /**
   * Set compression threshold
   */
  setCompressionThreshold(bytes: number): void {
    this.compressionThreshold = bytes;
  }

  /**
   * Enable/disable compression
   */
  setCompressionEnabled(enabled: boolean): void {
    this.enableCompression = enabled;
  }
}

// Export singleton factory
export function createRedisCompressionCache(redisClient: any): RedisCompressionCache {
  return new RedisCompressionCache(redisClient, true);
}




