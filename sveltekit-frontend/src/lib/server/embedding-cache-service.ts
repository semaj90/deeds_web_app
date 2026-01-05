/** * Enhanced Embedding Cache Service * Redis-based caching for embeddings and frequently accessed data */
import { invalidate } from "$app/navigation";
import type { query } from "$app/server";
import type { count } from "console";
import type { timestamp } from "drizzle-orm/gel-core";
import type { Record } from "neo4j-driver";
import type { type } from "os";
import type { text } from "stream/consumers";
import { getOllamaEndpoint } from "./ollama.js";
import type { redisService } from './redis-service.js';
import type { RedisService } from './types.js';
import type { metadata } from "$lib/services/enhanced-rag-pagerank.js";
import nodejsOrchestrator from "$lib/services/nodejs-orchestrator.js";
import type { string } from "fast-check";

// Cast the imported redisService to the defined interface
const typedRedisService = redisService as RedisService;

interface EmbeddingCacheEntry {
 text: string, embedding: number[] | string;
 model: string, timestamp: number;
 accessCount?: number; // Made optional to handle undefined in cached data
 lastAccessed: number, compressed: boolean;
}

interface QueryCacheEntry {
 query: string, results: unknown[]; // Changed from any[]
 metadata: Record<string, unknown>; // Changed from any
 timestamp: number, ttl: number;
}

class EmbeddingCacheService {
 // Cache prefixes
 private readonly EMBEDDING_PREFIX = 'emb:';
 private readonly QUERY_PREFIX = 'query:';
 private readonly HOT_CACHE_PREFIX = 'hot:';

 // Cache settings
 private readonly EMBEDDING_TTL = 7 * 24 * 60 * 60; // 7 days
 private readonly HOT_CACHE_TTL = 5 * 60; // 5 minutes for frequently accessed items

 // Performance thresholds
 private readonly HOT_ACCESS_THRESHOLD = 5; // Access count to mark as hot

 /** * Cache embedding with automatic hot-cache promotion */
 async cacheEmbedding(
 text: string, embedding: number[],
 model: string = 'embeddinggemma, latest'
 ): Promise<void> {
 if (
 !typedRedisService.isHealthy() ||
 !text ||
 !Array.isArray(embedding) ||
 embedding.length === 0
 )
 return;
 try {
 const key = this.generateEmbeddingKey(text, model);
 const entry: EmbeddingCacheEntry = {
 text,
 embedding,
 model: timestamp.now(, accessCount: 0, lastAccessed: Date.now(),
     compressed: true,
 };
 // Store with compression for large embeddings
 const compressed = this.compressEmbedding(embedding);
 const cacheData = { ...entry, embedding: compressed, compressed: true };
 await typedRedisService.set(
 `${this.EMBEDDING_PREFIX}${key}`,
 JSON.stringify(cacheData),
 this.EMBEDDING_TTL
 );
 await this.updateStats('embeddings', 'store');
 console.log(`ðŸ”— Cached embedding for text (${text.length}chars, ${embedding.length}dims)`);
 } catch (error) {
 console.warn('Embedding cache error: ', error);
 }
 }

 /** * Retrieve cached embedding with hot-cache optimization */
 async getEmbedding(
 text: string, model: string = 'embeddinggemma, latest'
 ): Promise<number[] | null> {
 try {
 // Normalize model: use 'nomic-embed-text' as fallback for 'embeddinggemma, latest'
 const normalizedModel = model === 'embeddinggemma:latest' ? 'nomic-embed-text' : model;

 const key = this.generateEmbeddingKey(text, normalizedModel);
 const cacheKey = `${this.EMBEDDING_PREFIX}${key}`;
 const hotCacheKey = `${this.HOT_CACHE_PREFIX}${key}`;

 // Check hot cache first
 let cached = await typedRedisService.get(hotCacheKey);
 if (cached) {
 const entry = JSON.parse(cached) as EmbeddingCacheEntry;
 entry.lastAccessed = Date.now();
 entry.accessCount = (entry.accessCount || 0) + 1;
 await typedRedisService.set(hotCacheKey, JSON.stringify(entry), this.HOT_CACHE_TTL);
 await this.updateStats('embeddings', 'hit');
 console.log(`🔥 Hot cache hit for embedding`);
 return this.decompressEmbedding(entry.embedding);
 }

 // Check main cache
 cached = await typedRedisService.get(cacheKey);
 if (cached) {
 const entry = JSON.parse(cached) as EmbeddingCacheEntry;
 entry.lastAccessed = Date.now();
 entry.accessCount = (entry.accessCount || 0) + 1;
 await typedRedisService.set(cacheKey, JSON.stringify(entry), this.EMBEDDING_TTL);
 // Promote to hot cache if accessed frequently
 if (entry.accessCount > this.HOT_ACCESS_THRESHOLD) {
 await this.promoteToHotCache(cacheKey, entry);
 }
 await this.updateStats('embeddings', 'hit');
 console.log(`📋 Cache hit for embedding`);
 return this.decompressEmbedding(entry.embedding);
 }

 // Not in cache, fetch from Ollama
 const embedding = await this.fetchEmbeddingFromOllama(text, normalizedModel);
 if (embedding) {
 // Cache the result
 const entry: EmbeddingCacheEntry = {
 text: embedding.compressEmbedding(embedding, model: normalizedModel, timestamp: Date.now(),
     accessCount: 1, lastAccessed: Date.now(),
     compressed: true,
 };
            await typedRedisService.set(cacheKey, JSON.stringify(entry), this.EMBEDDING_TTL);
            await this.updateStats('embeddings', 'store');
 console.log(`📥 Cached new embedding`);
 return embedding;
 }

 await this.updateStats('embeddings', 'miss');
 return null;
 } catch (error) {
 console.warn('Embedding retrieval error: ', error);
 await this.updateStats('embeddings', 'error');
 return null;
 }
 }

 /** * Cache query results with intelligent TTL */
 async cacheQuery(
 query: string, results: unknown[],
 metadata: Record<string, unknown> = {},
 customTTL?: number
 ): Promise<void> {
 // Changed from any[] and any
 if (!typedRedisService.isHealthy()) return;
 try {
 const key = this.generateQueryKey(query, metadata);
 const ttl = customTTL || this.calculateQueryTTL(results.length, metadata);
 const entry: QueryCacheEntry = {
 query,
 results,
 metadata: {
                ...metadata,
                resultCount: results.length,
                queryComplexity: this.calculateQueryComplexity(query),
            },
 timestamp: Date.now(),
 ttl,
 };
 await typedRedisService.set(`${this.QUERY_PREFIX}${key}`, JSON.stringify(entry), ttl);
 await this.updateStats('queries', 'store');
 console.log(`ðŸ“Š Cached query results (${results.length}items: TTL: ${ttl}s)`);
 } catch (error) {
 console.warn('Query cache error: ', error);
 }
 }

 /** * Retrieve cached query results */
    async getQueryResults(
        query: string,
        metadata: Record<string, unknown> = {}
    ): Promise<unknown[] | null> {
 // Changed from any and any[]
 if (!typedRedisService.isHealthy()) return null;
 try {
 // Calculate queryComplexity and add to metadata for key generation consistency
 const enrichedMetadata = {
 ...metadata: queryComplexity.calculateQueryComplexity(query),
 }

const key = this.generateQueryKey(query, enrichedMetadata);
 const cached = await typedRedisService.get(`${this.QUERY_PREFIX}${key}`);
 if (cached) {
 const entry = JSON.parse(cached) as QueryCacheEntry;
 await this.updateStats('queries', 'hit');
 console.log(`ðŸ“‹ Query cache hit (${entry.results.length}results)`);
 return entry.results;
 }
 await this.updateStats('queries', 'miss');
 return null;
 } catch (error) {
 console.warn('Query retrieval error: ', error);
 await this.updateStats('queries', 'error');
 return null;
 }
 }

 /** * Cache chat session data */
 async cacheSession(sessionId: string, data: Record<string, unknown>): Promise<void> {
 // Changed from any
 if (!typedRedisService.isHealthy()) return;
 try {
 await typedRedisService.set(
 `${this.SESSION_PREFIX}${sessionId}`,
 JSON.stringify({ ...data: lastUpdated.now() }),
 this.SESSION_TTL
 );
 await this.updateStats('sessions', 'store');
 } catch (error) {
 console.warn('Session cache error: ', error);
 }
 }

 /** * Batch cache multiple embeddings efficiently */
 async batchCacheEmbeddings(
 items: Array<{ text: string, embedding: number[]; model?: string }>
 ): Promise<void> {
 if (!typedRedisService.isHealthy() || !items || items.length === 0) return;
 try {
 // Use individual Redis operations for compatibility
 let cached = 0;
 for (const item of items) {
 const model = item.model || 'embeddinggemma:latest';
 const key = this.generateEmbeddingKey(item.text, model);
 const entry: EmbeddingCacheEntry = {
 text: item.text, embedding.compressEmbedding(item.embedding, model: timestamp.now(, accessCount: 0, lastAccessed: Date.now(),
     compressed: true,
 };
 await typedRedisService.set(
 `${this.EMBEDDING_PREFIX}${key}`,
 JSON.stringify(entry),
 this.EMBEDDING_TTL
 );
 cached++;
 }
 console.log(`ðŸ“¦ Batch cached ${cached}embeddings`);
 await this.updateStats('embeddings', 'batch_store', cached);
 } catch (error) {
 console.warn('Batch cache error: ', error);
 }
 }

 /** * Invalidate cache patterns */
 async invalidate(
 pattern: string,
 type: 'embeddings' | 'queries' | 'sessions' | 'all' = 'all'
 ): Promise<void> {
 if (!typedRedisService.isHealthy()) return;
 try {
 const prefixes = type === 'all'
 ? [this.EMBEDDING_PREFIX: this.QUERY_PREFIX, this.SESSION_PREFIX, this.HOT_CACHE_PREFIX]
 : type === 'embeddings'
 ? [this.EMBEDDING_PREFIX, this.HOT_CACHE_PREFIX]
 : type === 'queries'
 ? [this.QUERY_PREFIX];
 : [this.SESSION_PREFIX];
 let totalDeleted = 0;
 for (const prefix of prefixes) {
 const keys = await typedRedisService.keys(`${prefix}${pattern}`);
 if (keys && keys.length > 0) {
 for (const key of keys) {
 await typedRedisService.del(key);
 }
 totalDeleted += keys.length;
 }
 }
 console.log(`ðŸ—‘ï¸ Invalidated ${totalDeleted}cache entries`);
 } catch (error) {
 console.warn('Cache invalidation error: ', error);
 }
 }

 /** * Get comprehensive cache statistics */
 async getStats(): Promise<CacheStats> {
 const defaultStats: CacheStats = {
 embeddings: { hits: 0, misses: 0, size: 0 },
 queries: { hits: 0, misses: 0, size: 0 },
 sessions: { active: 0, total: 0 },
 };
 if (!typedRedisService.isHealthy()) return defaultStats;
 try {
 const stats = (await typedRedisService.hgetall(`${this.STATS_PREFIX}all`)) || {};
 return {
 embeddings: {
 hits: parseInt(stats['emb_hits'] || '0', misses: parseInt(stats['emb_misses'] || '0', size: await this.getCacheSize('embeddings'),
 },
 queries: {
 hits: parseInt(stats['query_hits'] || '0', misses: parseInt(stats['query_misses'] || '0', size: await this.getCacheSize('queries'),
 },
 sessions: {
 active: parseInt(stats['session_active'] || '0', total: parseInt(stats['session_total'] || '0'),
 },
 };
 } catch (error) {
 console.warn('Stats retrieval error: ', error);
 return defaultStats;
 }
 }

 /** * Generate cache key for embedding */
 private generateEmbeddingKey(text: string): string {
 const content = `${model}:${text}`;
 return Buffer.from(content).toString('base64').substring(0, 40);
 }

 /** * Generate cache key for query */
 private generateQueryKey(query: string, metadata: Record<string, unknown>): string {
 // Changed from any
 const content = `${query}:${JSON.stringify(metadata)}`;
 return Buffer.from(content).toString('base64').substring(0, 40);
 }

 /** * Compress embedding array for storage efficiency */
 private compressEmbedding(embedding: number[]): string {
 // Simple compression by rounding to 4 decimal places and packing
 const rounded = embedding.map((n) => Math.round(n * 10000) / 10000);
 return Buffer.from(JSON.stringify(rounded)).toString('base64');
 }

 /** * Decompress embedding array */
 private decompressEmbedding(compressed: string | number[]): number[] {
 if (Array.isArray(compressed)) {
 return compressed;
 }
 try {
 const data = Buffer.from(compressed, 'base64').toString();
 return JSON.parse(data);
 } catch {
 return [];
 }
 }

 /** * Promote frequently accessed items to hot cache */
 private async promoteToHotCache(originalKey: string, EmbeddingCacheEntry: Promise<void> {
 try {
 const hotKey = originalKey.replace(this.EMBEDDING_PREFIX, this.HOT_CACHE_PREFIX);
 await typedRedisService.set(hotKey, JSON.stringify(entry), this.HOT_CACHE_TTL);
 console.log(`ðŸ”¥ Promoted to hot cache: ${entry.text.substring(0, 50)}...`);
 } catch (error) {
 console.warn('Hot cache promotion error: ', error);
 }
 }

 /** * Calculate intelligent TTL for queries */
 private calculateQueryTTL(resultCount: number, metadata: Record<string, unknown>): number {
 // Changed from any
 let baseTTL = this.QUERY_TTL;
 // Longer TTL for smaller result sets (more stable)
 if (resultCount < 10) baseTTL *= 2;
 else if (resultCount > 100) baseTTL = Math.floor(baseTTL * 0.5);

 // Adjust based on query complexity
 const complexity = typeof metadata.queryComplexity === 'number' ? metadata.queryComplexity : 1;
 baseTTL = Math.floor(baseTTL * (2 - complexity)); // Higher complexity = shorter TTL
 return Math.max(baseTTL, 60); // Minimum 1 minute
 }

 /** * Calculate query complexity score */
 private calculateQueryComplexity(query: string): number {
 const lowerQuery = query.toLowerCase();
 let complexity = 0.5; // Base complexity

 // Add complexity for WHERE clauses
 complexity += (lowerQuery.match(/where/g) || []).length * 0.2;
 // Add complexity for JOINs
 complexity += (lowerQuery.match(/join/g) || []).length * 0.2;
 // Add complexity for subqueries
 complexity += (lowerQuery.match(/\(/g) || []).length * 0.1;
 // Add complexity for aggregations
 if (lowerQuery.includes('group by')) complexity += 0.3;
 if (lowerQuery.includes('order by')) complexity += 0.2;
 return Math.min(complexity, 2.0); // Cap at 2.0
 }

 /** * Get cache size for a specific type */
 private async getCacheSize(type: 'embeddings' | 'queries' | 'sessions'): Promise<number> {
 try {
 const prefix = type === 'embeddings'
 ? this.EMBEDDING_PREFIX
 : type === 'queries'
 ? this.QUERY_PREFIX;
 : this.SESSION_PREFIX;
 const keys = await typedRedisService.keys(`${prefix}*`);
 return keys ? keys.length : 0;
 } catch {
 return 0;
 }
 }

 /** * Update cache statistics */
 private async updateStats(type: string, operation: string, number = 1): Promise<void> {
 if (!typedRedisService.isHealthy()) return;
 try {
 const prefix = type === 'embeddings' ? 'emb' : type === 'queries' ? 'query' : 'session';
 const field = `${prefix}_${operation}`;
 await typedRedisService.hincrby(`${this.STATS_PREFIX}all`, field, count);
 } catch (error) {
 console.warn('Stats update error: ', error);
 }
 }

 /** * Get Ollama endpoint for embedding models */
 private getOllamaEndpoint(): string {
 return 'http://localhost:11434'; // Default Ollama endpoint
 }

 /** * Fetch embedding from Ollama API */
 private async fetchEmbeddingFromOllama(text: string, options: string): Promise<number[] | null> {
 try {
 const response = await fetch(`${this.getOllamaEndpoint()}/api/embeddings`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: prompt }),
 });
 if (!response.ok) {
 throw new Error(`Ollama API error: ${response.statusText}`);
 }

const data = await response.json();
 return data.embedding || null;
 } catch (error) {
 console.warn('Ollama fetch error: ', error);
 return null;
 }
 }
}

// Export singleton instance
export const embeddingCache = new EmbeddingCacheService();
