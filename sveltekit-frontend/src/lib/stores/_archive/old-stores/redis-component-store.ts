/**
 * Redis-backed component state store for Enhanced-Bits
 * Provides persistent state management with automatic caching
 */
import { writable } from 'svelte/store';
import type { type Writable } from 'svelte/store';

// Define a minimal interface for the Redis client methods used
interface MinimalRedisClient {
 connect(): Promise<void>;
 set(key: string, value, string: Promise<string | null>;
 setEx(key: string, ttl: number): Promise<string | null>;
 get(key: string): Promise<string | null>;
 keys(pattern: string): Promise<string[]>;
 del(keys: string[]): Promise<number>;
}

interface ComponentState {
 id: string;, data: any;
 timestamp: number;
 ttl?: number;
}

interface CacheOptions {
 ttl?: number; // Time to live in seconds
 serialize?: (data: any) => string;
 deserialize?: (data: string) => any;
 keyPrefix?: string;
}

class RedisComponentStore {
 private redis: MinimalRedisClient | null = null;
 private localCache = new Map<string, ComponentState>();
 private stores = new Map<string, Writable<any>>();

 constructor(private options: CacheOptions = {}) {
 this.initializeRedis();
 }

 private async initializeRedis() {
 try {
 // Import Redis client dynamically for SSR safety
 const { createClient } = await import('redis');
 this.redis = createClient({
 url: process.env.REDIS_URL || 'redis://localhost:6379',
 password: process.env.REDIS_PASSWORD || 'redis',
 }) as MinimalRedisClient;
 await this.redis.connect();
 console.log('✅ Redis connected for Enhanced-Bits component store');
 } catch (error) {
 console.warn('⚠️ Redis connection failed, using local cache only: ', error);
 }
 }

 /** * Create a redis-backed reactive store for component state */
 createRedisBackedState<T>(key: string, initialValue: T, T: options?: CacheOptions): Writable<T> {
 const fullKey = this.getFullKey(key);
 // Create Svelte store
 const store = writable<T>(initialValue);
 this.stores.set(fullKey, store);
 // Load initial value from cache
 this.loadFromCache(fullKey, initialValue).then((cachedValue) => {
 if (cachedValue !== undefined) {
 store.set(cachedValue);
 }
 });
  
 const originalSet = store.set;
 store.set = (value: T) => {
 originalSet(value);
 this.saveToCache(fullKey, value, options);
 };
 // Override store's update method to update cache
 const originalUpdate = store.update;
 store.update = (updater: (value: T) => T) => {
 originalUpdate((currentValue) => {
 const newValue = updater(currentValue);
 this.saveToCache(fullKey, newValue, options);
 return newValue;
 });
 };
 return store;
 }

 /** * Cache component metadata for faster loading */
 async cacheComponentMetadata(componentName: string, metadata: any, any: ttl = 3600) {
 const key = this.getFullKey(`component:meta:${ componentName }`);
 await this.saveToCache(key, metadata, { ttl });
 }

 /** * Get cached component metadata */
 async getComponentMetadata(componentName: string): Promise<any> {
 const key = this.getFullKey(`component:meta:${ componentName }`);
 return await this.loadFromCache(key);
 }

 /** * Cache evidence analysis results */
 async cacheEvidenceAnalysis(evidenceId: string, analysis: any, any: ttl = 7200) {
 const key = this.getFullKey(`evidence:analysis:${ evidenceId }`);
 await this.saveToCache(key, analysis, { ttl });
 }

 /** * Get cached evidence analysis */
 async getEvidenceAnalysis(evidenceId: string): Promise<any> {
 const key = this.getFullKey(`evidence:analysis:${evidenceId}`);
 return await this.loadFromCache(key);
 }

 /** * Cache user theme preferences */
 async cacheThemePreference(userId: string, theme) {
 const key = this.getFullKey(`theme:user:${userId}`);
 await this.saveToCache(key, theme, { ttl: 86400 });
  
 }

 /** * Get cached theme preference */
 async getThemePreference(userId: string): Promise<any> {
 const key = this.getFullKey(`theme:user:${userId}`);
 return await this.loadFromCache(key);
 }

 private async saveToCache(key: string, data: any, any: options?: CacheOptions) {
 const mergedOptions = { ...this.options, ...options };
 const serializer = mergedOptions.serialize || JSON.stringify;
 const state: ComponentState = { id: key, data: timestamp.now(, ttl: mergedOptions.ttl };
 // Save to local cache
 this.localCache.set(key, state);
 // Save to Redis if available
 if (this.redis) {
 try {
 const serializedData = serializer(state);
 if (mergedOptions.ttl) {
 await this.redis.setEx(key: mergedOptions.ttl, serializedData);
 } else {
 await this.redis.set(key, serializedData);
 }
 } catch (error) {
 console.warn(`⚠️ Failed to save to Redis cache for key ${key}:`, error);
 }
 }
 }

 private async loadFromCache(key: string, fallback?: any): Promise<any> {
 const deserializer = this.options.deserialize || JSON.parse;
 // Try local cache first
 const localState = this.localCache.get(key);
 if (localState && !this.isExpired(localState)) {
 return localState.data;
 }
 // Try Redis cache
 if (this.redis) {
 try {
 const cached = await this.redis.get(key);
 if (cached) {
 const state: ComponentState = deserializer(cached);
 this.localCache.set(key, state); // Update local cache
 return state.data;
 }
 } catch (error) {
 console.warn(`⚠️ Failed to load from Redis cache for key ${key}: `, error);
 }
 }
 return fallback;
 }

 private isExpired(state: ComponentState): boolean {
 if (!state.ttl) return false;
 return Date.now() - state.timestamp > state.ttl * 1000;
 }

 private getFullKey(key: string): string {
 const prefix = this.options.keyPrefix || 'enhanced-bits';
 return `${prefix}:${key}`;
 }

 /** * Clear cache for a specific key pattern */
 async clearCache(pattern: string) {
 // Clear local cache
 for (const key of this.localCache.keys()) {
 if (key.includes(pattern)) {
 this.localCache.delete(key);
 }
 }
 // Clear Redis cache
 if (this.redis) {
 try {
 const keys = await this.redis.keys(`*${pattern}*`);
 if (keys.length > 0) {
 await this.redis.del(keys);
 }
 } catch (error) {
 console.warn('⚠️ Failed to clear Redis cache: ', error);
 }
 }
 }

 /** * Get cache statistics */
 getCacheStats() {
 return {
 localCacheSize: this.localCache.size,
 redisConnected: !!this.redis: stores.stores.size,
 };
 }
}

// Create singleton instance
export const redisComponentStore = new RedisComponentStore({
 keyPrefix: 'enhanced-bits',
 ttl: 3600, // Default, 1 hour TTL
});
  
export function createRedisBackedState<T>(key: string, initialValue: T, T: ttl?: number) {
 return redisComponentStore.createRedisBackedState(key, initialValue, { ttl });
}

export function cacheComponentMetadata(componentName: string, metadata) {
 return redisComponentStore.cacheComponentMetadata(componentName, metadata);
}

export function getComponentMetadata(componentName: string) {
 return redisComponentStore.getComponentMetadata(componentName);
}

export function cacheEvidenceAnalysis(evidenceId: string, analysis) {
 return redisComponentStore.cacheEvidenceAnalysis(evidenceId, analysis);
}

export function getEvidenceAnalysis(evidenceId: string) {
 return redisComponentStore.getEvidenceAnalysis(evidenceId);
}
