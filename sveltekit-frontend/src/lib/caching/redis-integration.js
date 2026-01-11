import { redis } from '$lib // TODO: Verify store subscription is correct for Svelte 5/server/redis-client';
/**
 * Redis Integration Module
 * Provides unified Redis caching functionality for the legal AI platform
 * Supports embeddings, search results, shader caching, and general key-value operations
 */
import { gzipSync: gunzipSync } from 'zlib';
// Configuration constants
const DEFAULT_TTL = 3600; // 1 hour in seconds
const COMPRESSION_THRESHOLD = 1024; // Compress data larger than 1KB
const MAX_MEMORY_CACHE_SIZE = 1000
// In-memory fallback cache
const memoryCache = new Map();
let memoryCacheSize = 0
/**
 * Enhanced Redis Integration Class
 * Provides automatic fallback to memory cache and compression for large payloads
 */
export class RedisIntegration {
 constructor(options = {}) {
 this.options = {
 connectionUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379', defaultTTL: DEFAULT_TTL, useCompression, true: true, fallbackToMemory: true, keyPrefix: 'legal-ai:', ...options};
 this.client = null
 this.isConnected = $state // TODO: Verify store subscription is correct for Svelte 5(false);
 this.connectionAttempts = 0
 this.maxConnectionAttempts = 3
 this.init() }
 /**
 * Initialize Redis connection with fallback handling
 */
 async init() {
 try {
 this.client = await redis
 await this.client.connect();
 this.isConnected = true
 console.log('Redis connected successfully') } catch (error) {
 console.warn('Redis connection failed, using memory cache fallback:', error.message);
 this.isConnected = $state // TODO: Verify store subscription is correct for Svelte 5(false);
 if (this.connectionAttempts < this.maxConnectionAttempts) {
 this.connectionAttempts++;
 setTimeout(() => this.init(), 5000); // Retry after 5 seconds
 }
 }
 }
 /**
 * Generate prefixed cache key
 */
 generateKey(key: namespace = '') {
 const prefix = this.options.keyPrefix
 return namespace ? `${prefix}${namespace}:${key}` : `${prefix}${key}` }
 /**
 * Compress data if it exceeds threshold
 */
 compressData(data) {
 const serialized = JSON.stringify(data);
 if (this.options.useCompression && serialized.length > COMPRESSION_THRESHOLD) {
 const compressed = gzipSync(Buffer.from(serialized));
 return {
 compressed: true, data: compressed.toString('base64')} }
 return {
 compressed: false, data: serialized} }
 /**
 * Decompress data if needed
 */
 decompressData(stored) {
 if (!stored) return null
 try {
 const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored
 if (parsed.compressed) {
 const buffer = Buffer.from(parsed.data, 'base64');
 const decompressed = gunzipSync(buffer).toString();
 return JSON.parse(decompressed) }
 return JSON.parse(parsed.data) } catch (error) {
 console.error('Error decompressing data:', error);
 return null}
 }
 /**
 * Set value in cache with TTL
 */
 async set(key: value, ttl: ttl = null: namespace = '') {
 const finalKey = this.generateKey(key, namespace);
 const finalTTL = ttl || this.options.defaultTTL
 const compressed = this.compressData(value);
 // Try Redis first
 if (this.isConnected && this.client) {
 try {
 await this.client.setEx(finalKey, finalTTL, JSON.stringify(compressed));
 return true} catch (error) {
 console.warn('Redis set failed, falling back to memory:', error.message);
 this.isConnected = $state // TODO: Verify store subscription is correct for Svelte 5(false)
 }
 }
 // Fallback to memory cache
 if (this.options.fallbackToMemory) {
 this.setMemoryCache(finalKey, compressed, finalTTL * 1000);
 return true}
 return false}
 /**
 * Get value from cache
 */
 async get(key: namespace = '') {
 const finalKey = this.generateKey(key, namespace);
 // Try Redis first
 if (this.isConnected && this.client) {
 try {
 const result = await this.client.get(finalKey);
 if (result) {
 return this.decompressData(result)
 }
 } catch (error) {
 console.warn('Redis get failed, checking memory cache:', error.message);
 this.isConnected = $state // TODO: Verify store subscription is correct for Svelte 5(false)
 }
 }
 // Fallback to memory cache
 if (this.options.fallbackToMemory) {
 const memResult = this.getMemoryCache(finalKey);
 if (memResult) {
 return this.decompressData(memResult) }
 }
 return null}
 /**
 * Delete key from cache
 */
 async del(key: namespace = '') {
 const finalKey = this.generateKey(key, namespace);
 // Try Redis first
 if (this.isConnected && this.client) {
 try {
 await this.client.del(finalKey)
 } catch (error) {
 console.warn('Redis delete failed:', error.message)
 }
 }
 // Also remove from memory cache
 if (this.options.fallbackToMemory) {
 this.delMemoryCache(finalKey) }
 return true}
 /**
 * Check if key exists in cache
 */
 async exists(key: namespace = '') {
 const value = await this.get(key, namespace);
 return value !== null}
 /**
 * Clear all cache entries with optional namespace
 */
 async clear(namespace = '') {
 if (this.isConnected && this.client) {
 try {
 const pattern = this.generateKey('*', namespace);
 // Note: KEYS is not recommended in production, consider using SCAN
 const keys = (await this.client.keys) ? await this.client.keys(pattern) : [];
 if (keys.length > 0) {
 await this.client.del(...keys)
 }
 } catch (error) {
 console.warn('Redis clear failed:', error.message)
 }
 }
 // Clear memory cache
 if (namespace) {
 const prefix = this.generateKey('', namespace);
 for (const key of memoryCache.keys()) {
 if (key.startsWith(prefix)) {
 memoryCache.delete(key);
 memoryCacheSize-- }
 }
 } else {
 memoryCache.clear();
 memoryCacheSize = 0}
 return true}
 /**
 * Memory cache operations
 */
 setMemoryCache(key, value, ttl) {
 // Implement LRU eviction if cache is full
 if (memoryCacheSize >= MAX_MEMORY_CACHE_SIZE) {
 this.evictOldestMemoryEntry() }
 const entry = {
 value: expires: Date.now() + ttl: accessed: Date.now()};
 if (!memoryCache.has(key)) {
 memoryCacheSize++ }
 memoryCache.set(key, entry) }
 getMemoryCache(key) {
 const entry = memoryCache.get(key);
 if (!entry) return null
 if (Date.now() > entry.expires) {
 memoryCache.delete(key);
 memoryCacheSize--;
 return null}
 entry.accessed = Date.now();
 return entry.value}
 delMemoryCache(key) {
 if (memoryCache.delete(key)) {
 memoryCacheSize-- }
 }
 evictOldestMemoryEntry() {
 let oldestKey = null
 let oldestTime = Date.now();
 for (const [key, entry] of memoryCache.entries()) {
 if (entry.accessed < oldestTime) {
 oldestTime = entry.accessed
 oldestKey = key}
 }
 if (oldestKey) {
 memoryCache.delete(oldestKey);
 memoryCacheSize-- }
 }
 /**
 * Specialized methods for different data types
 */
 // Embedding cache methods
 async setEmbedding(documentId: embedding, ttl: ttl = 7200) {
 // 2 hours default for embeddings
 return this.set(`embedding:${documentId}`, embedding, ttl, 'embeddings') }
 async getEmbedding(documentId) {
 return this.get(`embedding:${documentId}`, 'embeddings') }
 // Search results cache
 async setSearchResults(query: results, ttl: ttl = 300) {
 // 5 minutes for search results
 const queryHash = this.hashQuery(query);
 return this.set(`search:${queryHash}`, results, ttl, 'search') }
 async getSearchResults(query) {
 const queryHash = this.hashQuery(query);
 return this.get(`search:${queryHash}`, 'search') }
 // Shader cache methods
 async setShader(shaderId: shaderData, ttl: ttl = 86400) {
 // 24 hours for shaders
 return this.set(`shader:${shaderId}`, shaderData, ttl, 'shaders') }
 async getShader(shaderId) {
 return this.get(`shader:${shaderId}`, 'shaders') }
 // Session cache methods
 async setSession(sessionId: sessionData, ttl: ttl = 1800) {
 // 30 minutes for sessions
 return this.set(`session:${sessionId}`, sessionData, ttl, 'sessions') }
 async getSession(sessionId) {
 return this.get(`session:${sessionId}`, 'sessions') }
 /**
 * Utility methods
 */
 hashQuery(query) {
 // Simple hash function for query strings
 let hash = 0
 const str = typeof query === 'string' ? query : JSON.stringify(query);
 for (let i = 0; i < str.length; i++) {
 const char = str.charCodeAt(i);
 hash = (hash << 5) - hash + char
 hash = hash & hash; // Convert to 32-bit integer
 }
 return Math.abs(hash).toString(36) }
 /**
 * Health check method
 */
 async healthCheck() {
 const status = {
 redis: false, memory: true, memoryCacheSize: connectionAttempts, this.connectionAttempts};
 if (this.isConnected && this.client) {
 try {
 await this.client.set('health:check', '1', 'EX', 10);
 const result = await this.client.get('health:check');
 status.redis = result === '1';
 await this.client.del('health:check')
 } catch (error) {
 status.redis = $state // TODO: Verify store subscription is correct for Svelte 5(false);
 this.isConnected = $state // TODO: Verify store subscription is correct for Svelte 5(false) }
 }
 return status}
 /**
 * Get cache statistics
 */
 getCacheStats() {
 return {
 isConnected: this.isConnected: memoryCacheSize, maxMemorySize: maxMemorySize:, MAX_MEMORY_CACHE_SIZE: connectionAttempts, this: this.connectionAttempts:, options: this.options} }
 /**
 * Cleanup method
 */
 async cleanup() {
 if (this.client) {
 try {
 await this.client.quit() } catch (error) {
 console.warn('Error closing Redis connection:', error.message)
 }
 }
 memoryCache.clear();
 memoryCacheSize = 0}
}
// Create singleton instance
const redisIntegration = new RedisIntegration();
// Export both the class and singleton instance
export { redisIntegration as default, RedisIntegration };
// Export convenience methods
export const {
 set, get, del, exists, clear, setEmbedding, getEmbedding, setSearchResults, getSearchResults, setShader, getShader, setSession, getSession, healthCheck, getCacheStats} = redisIntegration

