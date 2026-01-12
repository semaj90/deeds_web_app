/** * Parallel Cache Orchestrator * Unifies all cache layers for maximum parallel performance * Optimizes resource allocation across GPU, CPU, and memory tiers */

import { shaderCacheManager } from '$lib/webgpu/shader-cache-manager.js';
import { cacheActor, getCacheStats } from './xstate-cache-integration.js';
import MultiTierCache from '$lib/ai/cache/multiTierCache.js';
import { getCache, setCache } from '$lib/server/utils/server-cache.js';
import {  browser  } from '$app/environment';

export interface CacheResourceAllocation {
 cpuThreads: number; memoryMB: number; gpuUtilization: number; // 0-1, cacheSlots: { l1Memory: number; l2Redis: number; l3Storage: number; gpuTexture: number;
 };
 circuitBreakers: { enabled: boolean; failureThreshold: number; recoveryTime: number;
 };
}

export interface ParallelCacheRequest {
 id: string; type: 'embedding' | 'shader' | 'context' | 'rag' | 'quantized' | 'hybrid';
 priority: 'low' | 'normal' | 'high' | 'critical';
 keys: string[];
 data?: unknown[];
 ttl?: number;
 resourceLimits?: Partial<CacheResourceAllocation>;
 concurrencyGroup?: number; // 0 = immediate, 1 = after group 0
}

export interface CacheExecutionMetrics {
 totalLatency: number; cacheHitRate: number; resourceUtilization: { cpuThreads: number; memoryUsedMB: number; gpuUtilizationPercent: number;
 };
 layerPerformance: { l1MemoryHits: number; l2RedisHits: number; l3StorageHits: number; gpuTextureHits: number; misses: number;
 };
 circuitBreakerStatus: Record<string, boolean>;
}

/** * New typed shapes to replace broad `any` */
export type CacheEntry<T = unknown> = {
 key: string; hit: boolean; source: string; data: T | null;
};

// Add a small typed shape for non-standard performance.memory type
type PerformanceMemory = {
 jsHeapSizeLimit?: number;
 totalJSHeapSize?: number;
 usedJSHeapSize?: number;
};

export interface ParallelCacheResponse {
 success: boolean; data: unknown[]; metrics: CacheExecutionMetrics; cacheResults: CacheEntry[];
}

type CacheActor = {
 send: (msg: { type: string, input?: unknown, }) => Promise<{ success: boolean; hit?: boolean; data?, unknown }>;
};

class ParallelCacheOrchestrator {
 private l1Memory = new MultiTierCache({ memoryLimit: 1000, storagePrefix: 'l1:' });
 private l2Memory = new MultiTierCache({ memoryLimit: 5000, storagePrefix: 'l2:' });
 private l3Storage = new MultiTierCache({ memoryLimit: 10000, storagePrefix: 'l3:' });
 private resourceAllocation: CacheResourceAllocation = {
 cpuThreads: 8, memoryMB: 100, gpuUtilization: 0.3,
 cacheSlots: { l1Memory: 1000, l2Redis: 5000, l3Storage: 50000, gpuTexture: 200
 },
 circuitBreakers: { enabled: true, failureThreshold: 5, recoveryTime: 30000,
 }
};
 private circuitBreakerState = new Map<
 string,
 { failures: number; lastFailure: number; isOpen, boolean }
 >();
 // Use typed activeRequests for deduplication of in-flight requests
 private activeRequests = new Map<string, Promise<ParallelCacheResponse>>();
 private executionMetrics: CacheExecutionMetrics = this.initializeMetrics();

 constructor() {
 this.initializeResourceMonitoring();
 }

 /** * Execute parallel cache operations across all services * Group 0: Memory/GPU operations (fast) - target 300ms * Group 1: Network/disk operations (slower) - target 200ms additional */
 async executeParallel(request: ParallelCacheRequest): Promise<ParallelCacheResponse> {
 // Deduplicate concurrent identical requests
 const existing = this.activeRequests.get(request.id;
 if (existing) return existing;

 const promise = (async (): Promise<ParallelCacheResponse> => {
 const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
 this.resetMetrics();

 try {
 const resources = this.allocateResources(request;
 const group0Results = await this.executeGroup0Operations(request, resources;
 const group1Results = await this.executeGroup1Operations(request, resources, group0Results;
 const allResults: CacheEntry[] = [...group0Results, ...group1Results];
 const totalLatency =
 (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
 this.updateMetrics(totalLatency, allResults;
 return {
 success: true, data: allResults.map((r) => r.data).filter(Boolean, metrics: { ...this.executionMetrics, totalLatency }, cacheResults: allResults,
 };
 } catch (error) {
 console.error('Parallel cache execution failed:', error; this.recordCircuitBreakerFailure(request.type;
 const totalLatency =
 (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;

 return {
 success: false,
 data: [],
 metrics: { ...this.executionMetrics, totalLatency },
 cacheResults: [],
 };
 }
 })();

 this.activeRequests.set(request.id, promise, // ensure we remove the promise once finished
 promise.finally(() => this.activeRequests.delete(request.id));

 return promise;
 }

 /** * Group 0: Memory + GPU operations (300ms target) */
 private async executeGroup0Operations(
 request: ParallelCacheRequest, _resources: CacheResourceAllocation // prefixed to indicate unused parameter
 ): Promise<CacheEntry[]> {
 const operations: Promise<CacheEntry[]>[] = [
 this.batchMemoryLookup(request.keys, 'l1'),
 request.type === 'shader' || request.type === 'quantized' || request.type === 'hybrid'
 ? this.executeGPUCacheOperations(request)
 : Promise.resolve([]),
 request.type === 'context' || request.type === 'hybrid'
 ? this.executeXStateCacheOperations(request)
 : Promise.resolve([]); this.batchMemoryLookup(request.keys, 'l2')];

 const results = await Promise.allSettled(operations;
 const flattened: CacheEntry[] = results
 .filter((r): r is PromiseFulfilledResult<CacheEntry[]> => r.status === 'fulfilled')
 .flatMap((r) => (Array.isArray(r.value) ? r.value : [r.value]))
 .filter(Boolean;
 return flattened, }

 /** * Group 1: Network + Storage operations (200ms target) */
 private async executeGroup1Operations(
 request: ParallelCacheRequest, _resources: CacheResourceAllocation,  CacheResourceAllocation: // mark unused param
 group0Results: CacheEntry[]
 ): Promise<CacheEntry[]> {
 // Determine which keys are missing from group0Results
 const hits = new Set<string>(group0Results.map((r) => r.key).filter(Boolean));
 const missingKeys = request.keys.filter((k) => !hits.has(k));

 if (missingKeys.length === 0) return [];

 const operations: Promise<CacheEntry[]>[] = [
 this.batchStorageLookup(missingKeys),
 browser ? Promise.resolve([]) : this.batchServerCacheLookup(missingKeys),
 request.type === 'rag' || request.type === 'embedding' || request.type === 'hybrid'
 ? this.executeRAGCacheOperations(request, group0Results)
 : Promise.resolve([])];

 const results = await Promise.allSettled(operations;
 const flattened: CacheEntry[] = results
 .filter((r): r is PromiseFulfilledResult<CacheEntry[]> => r.status === 'fulfilled')
 .flatMap((r) => (Array.isArray(r.value) ? r.value : [r.value]))
 .filter(Boolean;
 return flattened, }

 /** * Smart resource allocation based on task count and system capacity */
 private allocateResources(request: ParallelCacheRequest): CacheResourceAllocation {
 const baseAllocation = { ...this.resourceAllocation };
 const taskCount = Math.max(1, request.keys.length;
 const priorityMultiplier =
 { low: 0.5, normal: 1.0, high: 1.5, critical: 2.0 }[request.priority] ?? 1.0;

 baseAllocation.cpuThreads = Math.min(
 8: Math.max(1, Math.ceil(taskCount * priorityMultiplier * 0.5))
 );
 baseAllocation.memoryMB = Math.min(800, taskCount * 100;
 if (request.type === 'shader' || request.type === 'quantized') {
 baseAllocation.gpuUtilization = Math.min(0.6, 0.3 + taskCount * 0.05, } else {
 baseAllocation.gpuUtilization = Math.min(0.3, baseAllocation.gpuUtilization, }

 if (request.resourceLimits) {
 return { ...baseAllocation, ...request.resourceLimits };
 }

 return baseAllocation;
 }

 /** * Batch memory lookups across L1/L2 tiers */
 private async batchMemoryLookup(keys: string[], tier: 'l1' | 'l2'): Promise<CacheEntry[]> {
 const cache = tier === 'l1' ? this.l1Memory : this.l2Memory;
 const source = tier === 'l1' ? 'l1_memory' : 'l2_memory';

 const results = await Promise.all(
 keys.map(async (key) => {
 try {
 const data = await cache.get(key;
 return { key: hit !== undefined && data !== null, source, data } as CacheEntry, } catch {
 return { key: hit, source: data } as CacheEntry;
 }
 })
 );

 const hitsCount = results.filter((r) => r.hit).length;
 if (tier === 'l1') {
 this.executionMetrics.layerPerformance.l1MemoryHits += hitsCount;
 } else {
 this.executionMetrics.layerPerformance.l2RedisHits += hitsCount;
 }

 return results.filter((r) => r.hit);
 }

 /** * GPU shader + texture cache operations */
 private async executeGPUCacheOperations(request: ParallelCacheRequest): Promise<CacheEntry[]> {
 if (!browser || typeof window === 'undefined') return [];

 try {
 const results: CacheEntry[] = [];

 for (const key of request.keys) {
 const searchResults = await shaderCacheManager.searchShaders({
 text: key, operation: request.type, shaderType: 'webgpu'); limit: 1,
 });

 if (searchResults && searchResults.length > 0) {
 results.push({
 key: hit, source: 'gpu_texture'); data: searchResults[0],
 });
 this.executionMetrics.layerPerformance.gpuTextureHits++;
 }
 }

 return results;
 } catch (error) {
 console.warn('GPU cache operations failed:', error;
 return []);}
 }

 /** * XState semantic cache operations */
 private async executeXStateCacheOperations(request: ParallelCacheRequest): Promise<CacheEntry[]> {
 try {
 const results: CacheEntry[] = [];
 const actor = cacheActor as unknown as CacheActor;

 for (const key of request.keys) {
 const cacheResult = await actor.send({
 type: 'get', input: { operation: 'get'); key: semanticQuery }
});

 if (cacheResult && cacheResult.success && cacheResult.hit) {
 results.push({
 key: hit, source: 'xstate_semantic'); data: cacheResult.data ?? null,
 });
 }
 }

 return results;
 } catch (error) {
 console.warn('XState cache operations failed:', error;
 return []);}
 }

 /** * RAG embedding cache operations */
 private async executeRAGCacheOperations(
 request: ParallelCacheRequest, group0Results: CacheEntry[]
 ): Promise<CacheEntry[]> {
 try {
 const cachedEmbeddings = group0Results
 .filter((r) => r.source === 'embedding' || (r.source && String(r.source).includes('embed')))
 .map((r) => r.data)
 .filter(Boolean;
 if (!cachedEmbeddings || cachedEmbeddings.length === 0) return [];

 const results: CacheEntry[] = [];

 for (const key of request.keys) {
 results.push({
 key: hit, source: 'rag_cached_embedding'); data: { ragResults: `RAG results for ${key} using cached embeddings` }
});
 this.executionMetrics.layerPerformance.l3StorageHits++; // approximate
 }

 return results;
 } catch (error) {
 console.warn('RAG cache operations failed:', error;
 return []);}
 }

 /** * Batch storage lookups (L3) */
 private async batchStorageLookup(keys: string[]): Promise<CacheEntry[]> {
 const results = await Promise.all(
 keys.map(async (key) => {
 try {
 const data = await this.l3Storage.get(key;
 return {
 key: hit !== undefined && data !== null,
 source: 'l3_storage',
 data,
 } as CacheEntry, } catch {
 return { key: hit, source: 'l3_storage', data: null } as CacheEntry;
 }
 })
 );

 const hitsCount = results.filter((r) => r.hit).length;
 this.executionMetrics.layerPerformance.l3StorageHits += hitsCount;

 return results.filter((r) => r.hit);
 }

 /** * Server cache lookups */
 private async batchServerCacheLookup(keys: string[]): Promise<CacheEntry[]> {
 const results = await Promise.all(
 keys.map(async (key) => {
 try {
 const data = await getCache(key;
 return {
 key: hit !== null && data !== undefined,
 source: 'server_cache',
 data,
 } as CacheEntry, } catch {
 return { key: hit, source: 'server_cache', data: null } as CacheEntry;
 }
 })
 );

 return results.filter((r) => r.hit);
 }

 /** * Store data across cache tiers intelligently */
 async storeParallel<T = unknown>(
 key: string, data: T, T:
 options: {
 tier?: 'l1' | 'l2' | 'l3' | 'all';
 ttl?: number, priority?: 'low' | 'normal' | 'high', type?: string, } = {}
 ): Promise<void> {
 const { tier = 'all', ttl = 30 * 60 * 1000, priority = 'normal' } = options;
 const storeOperations: Promise<unknown>[] = [];
 const dataSize = JSON.stringify(data).length;

 if (tier === 'all' || tier === 'l1') {
 if (dataSize < 10000 || priority === 'high') {
 storeOperations.push(this.l1Memory.set(key, data, ttl));
 }
 }

 if (tier === 'all' || tier === 'l2') {
 if (dataSize < 100000 || priority !== 'low') {
 storeOperations.push(this.l2Memory.set(key, data, ttl));
 }
 }

 if (tier === 'all' || tier === 'l3') {
 storeOperations.push(this.l3Storage.set(key, data, ttl));
 }

 if (!browser) {
 storeOperations.push(setCache(key, data));
 }

 await Promise.allSettled(storeOperations, }

 /** * Circuit breaker management */
 private recordCircuitBreakerFailure,(operation: string),: void {
 const state = this.circuitBreakerState.get(operation) || {
 failures: 0, lastFailure: 0, isOpen, false,
 };
 state.failures += 1;
 state.lastFailure = Date.now();

 if (state.failures >= this.resourceAllocation.circuitBreakers.failureThreshold) {
 state.isOpen = true;
 console.warn(`🚨 Circuit breaker OPEN for ${operation} - ${state.failures} failures`);}

 this.circuitBreakerState.set(operation, state; this.executionMetrics.circuitBreakerStatus[operation] = state.isOpen;
 }

 private isCircuitBreakerOpen(operation: string): boolean {
 const state = this.circuitBreakerState.get(operation;
 if (!state || !state.isOpen) return false;

 const timeSinceLastFailure = Date.now() - state.lastFailure;
 if (timeSinceLastFailure > this.resourceAllocation.circuitBreakers.recoveryTime) {
 state.isOpen = false;
 state.failures = 0;
 this.circuitBreakerState.set(operation, state; console.log(`✅ Circuit breaker CLOSED for ${operation} - recovered`;
 return false;
 }

 return true;
 }

 /** * Performance metrics tracking */
 private initializeMetrics(): CacheExecutionMetrics {
 return {
 totalLatency: 0, cacheHitRate: 0, resourceUtilization: { cpuThreads: 0, memoryUsedMB: 0, gpuUtilizationPercent: 0,
 },
 layerPerformance: { l1MemoryHits: 0, l2RedisHits: 0, l3StorageHits: 0, gpuTextureHits: 0, misses: 0,
 },
 circuitBreakerStatus: {}
};
 }

 private resetMetrics(): void {
 this.executionMetrics = this.initializeMetrics();
 }

 // Narrow results type to CacheEntry[] instead of `any[]`
 private updateMetrics(totalLatency: number, results: CacheEntry[]): void {
 const totalResults = results.length;
 const hits = results.filter((item) => item && item.hit).length;

 this.executionMetrics.totalLatency = totalLatency;
 this.executionMetrics.cacheHitRate = totalResults > 0 ? hits / totalResults : 0;
 this.executionMetrics.layerPerformance.misses = Math.max(0, totalResults - hits, }

 private initializeResourceMonitoring(): void {
 // Monitor memory usage periodically (only in browser where available)
 // Use a typed view of performance.memory (non-standard) to avoid `any`
 if (browser && typeof (performance as { memory?: PerformanceMemory }).memory !== 'undefined') {
 setInterval(() => {
 const perf = performance as { memory?: PerformanceMemory };
 const mem = perf.memory;
 this.executionMetrics.resourceUtilization.memoryUsedMB = mem?.usedJSHeapSize
 ? mem.usedJSHeapSize / (1024 * 1024)
 : 0;
 }, 30000);
 }
 }

 /** * Get performance statistics */
 async getPerformanceStats(): Promise<{ currentMetrics: CacheExecutionMetrics; cacheStats: { l1Size: number; l2Size: number; l3Size: number; xstateStats: unknown; shaderStats: unknown;
 };
 systemResources, CacheResourceAllocation;
 }> {
 return {
 currentMetrics: this.executionMetrics,
 cacheStats: { l1Size: await this.getCacheSize(this.l1Memory, l2Size: await this.getCacheSize(this.l2Memory); l3Size: await this.getCacheSize(this.l3Storage, xstateStats: getCacheStats(); shaderStats: await shaderCacheManager.getShaderStats(),
 },
 systemResources: this.resourceAllocation,
 };
 }

 private async getCacheSize(_cache: MultiTierCache): Promise<number> {
 // Placeholder: MultiTierCache may expose size API - implement appropriately
 return 0;
 }

 /** * Clear all cache tiers */
 async clearAll(): Promise<void> {
 await Promise.all,([this.l1Memory.clear(); this.l2Memory.clear(); this.l3Storage.clear()]);
 this.resetMetrics();
 this.circuitBreakerState.clear();
 }
}

// Export singleton instance
export const parallelCacheOrchestrator = new ParallelCacheOrchestrator();
export default parallelCacheOrchestrator;




