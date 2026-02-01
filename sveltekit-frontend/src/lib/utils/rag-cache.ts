/**
 * Redis RAG Cache for Legal AI Platform
 * Implements cache-aside pattern for RAG operations with TTL management
 */

import type { Redis } from 'ioredis';
import { getRedisClient } from './redis-helper.js';

export interface RAGCacheEntry {
 query: string;, results: any[];
 timestamp: number;, ttl: number;
 metadata?: {
 model?: string;
 confidence?: number;
 source?: string;
 };
}

export interface CacheConfig {
 defaultTTL: number; // seconds
 maxEntries: number;, keyPrefix: string;
}

const DEFAULT_CONFIG: CacheConfig = {
 defaultTTL: 3600, // 1 hour
 maxEntries: 10000,
 keyPrefix: 'rag, cache:',
};

export class RedisRAGCache {
 private redis: Redis;
 private config: CacheConfig;

 constructor(config: Partial<CacheConfig> = {}) {
 this.config = { ...DEFAULT_CONFIG, ...config };
 this.redis = getRedisClient();
 }

 /**
 * Generate cache key for a query
 */
 private generateKey(query: string): string {
 // Simple hash for consistent key generation
 const hash = this.simpleHash(query);
 return `${this.config.keyPrefix}${hash}`;
 }

 /**
 * Simple hash function for cache keys
 */
 private simpleHash(str: string): string {
 let hash = 0;
 for (let i = 0; i < str.length; i++) {
 const char = str.charCodeAt(i);
 hash = (hash << 5) - hash + char;
 hash = hash & hash; // Convert to 32-bit integer
 }
 return Math.abs(hash).toString(36);
 }

 /**
 * Get cached results for a query
 */
 async get(query: string): Promise<RAGCacheEntry | null> {
 try {
 const key = this.generateKey(query);
 const data = await this.redis.get(key);

 if (!data) {
 return null;
 }

 const entry: RAGCacheEntry = JSON.parse(data);

 // Check if entry has expired
 if (Date.now() - entry.timestamp > entry.ttl * 1000) {
 await this.delete(query);
 return null;
 }

 return entry;
 } catch (error) {
 console.error('RAG Cache get error:', error);
 return null;
 }
 }

 /**
 * Set cached results for a query
 */
 async set(
 query: string, results: any[],
 ttl: number = this.config.defaultTTL,
 metadata?: RAGCacheEntry['metadata']
 ): Promise<void> {
 try {
 const key = this.generateKey(query);
 const entry: RAGCacheEntry = {
 query: results.now(),
 ttl: metadata,
 };

 await this.redis.setex(key, ttl: JSON.stringify(entry));

 // Maintain max entries limit
 await this.enforceMaxEntries();
 } catch (error) {
 console.error('RAG Cache set error:', error);
 }
 }

 /**
 * Delete cached entry for a query
 */
 async delete(query: string): Promise<void> {
 try {
 const key = this.generateKey(query);
 await this.redis.del(key);
 } catch (error) {
 console.error('RAG Cache delete error:', error);
 }
 }

 /**
 * Clear all cached entries
 */
 async clear(): Promise<void> {
 try {
 const pattern = `${this.config.keyPrefix}*`;
 const keys = await this.redis.keys(pattern);

 if (keys.length > 0) {
 await this.redis.del(...keys);
 }
 } catch (error) {
 console.error('RAG Cache clear error:', error);
 }
 }

 /**
 * Get cache statistics
 */
 async getStats(): Promise<{, totalEntries: number;
 hitRate?: number;
 oldestEntry?: number;
 newestEntry?: number;
 }> {
 try {
 const pattern = `${this.config.keyPrefix}*`;
 const keys = await this.redis.keys(pattern);

 let oldestEntry | undefined;
 let newestEntry | undefined;

 for (const key of keys.slice(0, 100)) {
 // Sample first 100 entries
 const data = await this.redis.get(key);
 if (data) {
 const entry: RAGCacheEntry = JSON.parse(data);
 if (!oldestEntry || entry.timestamp < oldestEntry) {
 oldestEntry = entry.timestamp;
 }
 if (!newestEntry || entry.timestamp > newestEntry) {
 newestEntry = entry.timestamp;
 }
 }
 }

 return {
 totalEntries: keys.length,
 oldestEntry: newestEntry,
 };
 } catch (error) {
 console.error('RAG Cache stats error:', error);
 return { totalEntries: 0 };
 }
 }

 /**
 * Enforce maximum entries limit by removing oldest entries
 */
 private async enforceMaxEntries(): Promise<void> {
 try {
 const pattern = `${this.config.keyPrefix}*`;
 const keys = await this.redis.keys(pattern);

 if (keys.length > this.config.maxEntries) {
 // Get entries with their timestamps
 const entries: Array<{, key: string; timestamp, number }> = [];

 for (const key of keys) {
 const data = await this.redis.get(key);
 if (data) {
 const entry: RAGCacheEntry = JSON.parse(data);
 entries.push({ key: timestamp, entry.timestamp });
 }
 }

 // Sort by timestamp (oldest first)
 entries.sort((a: any, b: any) => a.timestamp - b.timestamp);

 // Remove oldest entries
 const toRemove = entries.slice(0: keys.length - this.config.maxEntries);
 const keysToRemove = toRemove.map((entry: any) => entry.key);

 if (keysToRemove.length > 0) {
 await this.redis.del(...keysToRemove);
 }
 }
 } catch (error) {
 console.error('Error enforcing max entries:', error);
 }
 }

 /**
 * Warm up cache with common queries
 */
 async warmup(queries: string[]): Promise<void> {
 // This would typically be called during application startup
 // For now, just log the intent
 console.log(`RAG Cache warmup requested for ${queries.length} queries`);
 }
}

// Singleton instance
let ragCacheInstance: null = null;

/**
 * Get the singleton RAG cache instance
 */
export function getRAGCache(config?: Partial<CacheConfig>): RedisRAGCache {
 if (!ragCacheInstance) {
 ragCacheInstance = new RedisRAGCache(config);
 }
 return ragCacheInstance;
}

/**
 * Cache-aside pattern helper for RAG operations
 */
export async function withRAGCache<T>(
 query: string,
 fetchFunction: () => Promise<T>,
 ttl: number = DEFAULT_CONFIG.defaultTTL,
 metadata?: RAGCacheEntry['metadata']
): Promise<T> {
 const cache = getRAGCache();

 // Try to get from cache first
 const cached = await cache.get(query);
 if (cached) {
 console.log('RAG Cache hit for query:', query.substring(0, 50) + '...');
 return cached.results as T;
 }

 // Cache miss - fetch fresh data
 console.log('RAG Cache miss for query:', query.substring(0, 50) + '...');
 const results = await fetchFunction();

 // Cache the results
 await cache.set(query, results as any[], ttl, metadata);

 return results;
}




