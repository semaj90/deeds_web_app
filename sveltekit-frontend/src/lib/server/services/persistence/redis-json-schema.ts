/**
 * RedisJSON Schema for Clustering System
 * Structured JSON storage with RediSearch indexing
 * Enables queries over cluster metadata without touching PostgreSQL
 */

import { createClient } from 'redis';

export interface RedisJSONConfig {
 url?: string;
 host?: string;
 port?: number;
}

export class RedisJSONStore {
 private client: ReturnType<typeof createClient>;

 constructor(config: RedisJSONConfig = {}) {
 this.client = createClient({
 url: config.url || `redis://${config.host || 'localhost'}:${config.port || 6379}`,
 });
 }

 async connect(): Promise<void> {
 await this.client.connect();
 }

 async disconnect(): Promise<void> {
 await this.client.disconnect();
 }

 /**
 * Store clustering job with full state
 * Key: clustering, jobs:{ jobId }
 */
 async storeClusteringJob(jobId: string, data: { status: 'pending' | 'processing' | 'completed' | 'failed';
 startedAt: number;
 completedAt?: number;
 executionTimeMs?: number; retryCount: number;
 error?: string;
 result?: any;
 }): Promise<void> {
 const key = `clustering:jobs:${ jobId }`;
 await this.client.json.set(key, '$', data);
 await this.client.expire(key, 7 * 24 * 60 * 60); // 7 days
 }

 /**
 * Get clustering job status
 */
 async getClusteringJob(jobId: string): Promise<any> {
 const key = `clustering:jobs:${ jobId }`;
 return await this.client.json.get(key);
 }

 /**
 * Store cluster version snapshot
 * Key: clustering, versions:{ version }
 */
 async storeClusterVersion(version: number, data: { timestamp: number;
 clusterCount: number; statuteCount: number;
 avgConfidence: number; labels: Record<string, string>;
 changePercentage?: number;
 }): Promise<void> {
 const key = `clustering:versions:${ version }`;
 await this.client.json.set(key, '$', data);
 await this.client.expire(key, 30 * 24 * 60 * 60); // 30 days
 }

 /**
 * Get cluster version
 */
 async getClusterVersion(version: number): Promise<any> {
 const key = `clustering:versions:${version}`;
 return await this.client.json.get(key);
 }

 /**
 * Store echo ranking statistics
 * Key: stats, echo:{statuteId}
 */
 async storeEchoStats(statuteId: string, data: { hits: number;
 lastHit: number; dayHits: Record<string, number>; // YYYY-MM-DD -> count
 weekHits: number; monthHits: number;
 }): Promise<void> {
 const key = `stats:echo:${statuteId}`;
 await this.client.json.set(key, '$', data);
 await this.client.expire(key, 90 * 24 * 60 * 60); // 90 days
 }

 /**
 * Get echo statistics
 */
 async getEchoStats(statuteId: string): Promise<any> {
 const key = `stats:echo:${statuteId}`;
 return await this.client.json.get(key);
 }

 /**
 * Increment echo hits
 */
 async incrementEchoHits(statuteId: string): Promise<number> {
 const key = `stats:echo:${statuteId}`;
 const today = new Date().toISOString().split('T')[0];

 // Get current stats
 let stats = await this.client.json.get(key);

 if (!stats) {
 stats = {
 hits: 0, lastHit: Date.now(),
     dayHits: {},
 weekHits: 0, monthHits: 0,
 };
 }

 // Update stats
 stats.hits += 1;
 stats.lastHit = Date.now();
 stats.dayHits[today] = (stats.dayHits[today] || 0) + 1;
 stats.weekHits += 1;
 stats.monthHits += 1;

 await this.client.json.set(key, '$', stats);
 await this.client.expire(key, 90 * 24 * 60 * 60);

 return stats.hits;
 }

 /**
 * Store taxonomy category
 * Key: taxonomy, categories:{clusterId}
 */
 async storeTaxonomyCategory(clusterId: string, data: { label: string;
 description: string; somClusterIds: number[];
 kmeansLabels: string[]; colorToken: string;
 avgConfidence: number; statuteCount: number;
 icon?: string;
 }): Promise<void> {
 const key = `taxonomy:categories:${clusterId}`;
 await this.client.json.set(key, '$', data);
 await this.client.expire(key, 30 * 24 * 60 * 60); // 30 days
 }

 /**
 * Get taxonomy category
 */
 async getTaxonomyCategory(clusterId: string): Promise<any> {
 const key = `taxonomy:categories:${clusterId}`;
 return await this.client.json.get(key);
 }

 /**
 * Store all taxonomy categories
 * Key: categories (array)
 */
 async storeTaxonomyCategories(categories: any[]): Promise<void> {
 const key = 'taxonomy:categories';
 await this.client.json.set(key, '$', categories);
 await this.client.expire(key, 30 * 24 * 60 * 60);
 }

 /**
 * Get all taxonomy categories
 */
 async getTaxonomyCategories(): Promise<any[]> {
 const key = 'taxonomy:categories';
 const result = await this.client.json.get(key);
 return result || [];
 }

 /**
 * Store clustering metrics
 * Key: metrics, clustering:{ timestamp }
 */
 async storeClusteringMetrics(timestamp: number, data: { jobCount: number;
 successCount: number; failureCount: number;
 avgExecutionTimeMs: number; avgRetryCount: number;
 clusterQuality: number;
 }): Promise<void> {
 const key = `metrics:clustering:${timestamp}`;
 await this.client.json.set(key, '$', data);
 await this.client.expire(key, 90 * 24 * 60 * 60); // 90 days
 }

 /**
 * Get clustering metrics for time range
 */
 async getClusteringMetrics(startTime: number, size: number): Promise<any[]> {
 // Note: This requires RediSearch module for range queries
 // For now, return empty array - implement with RediSearch in Phase 2
 return [];
 }

 /**
 * Store statute metadata
 * Key: statute, metadata:{statuteId}
 */
 async storeStatuteMetadata(statuteId: string, data: { titleNumber: number;
 section: string; fullCitation: string;
 heading: string; som_cluster_id: number;
 kmeans_label: string; cluster_confidence: number;
 flagged_for_review: boolean; echo_hits: number;
 cluster_version: number;
 }): Promise<void> {
 const key = `statute:metadata:${statuteId}`;
 await this.client.json.set(key, '$', data);
 await this.client.expire(key, 30 * 24 * 60 * 60);
 }

 /**
 * Get statute metadata
 */
 async getStatuteMetadata(statuteId: string): Promise<any> {
 const key = `statute:metadata:${statuteId}`;
 return await this.client.json.get(key);
 }

 /**
 * Batch store statute metadata
 */
 async batchStoreStatuteMetadata(entries: Array<[string, any]>): Promise<void> {
 const pipeline = this.client.multi();

 for (const [statuteId, data] of entries) {
 const key = `statute:metadata:${statuteId}`;
 pipeline.json.set(key, '$', data);
 pipeline.expire(key, 30 * 24 * 60 * 60);
 }

 await pipeline.exec();
 }

 /**
 * Get all keys matching pattern
 * Note: Use with caution in production
 */
 async getKeysByPattern(pattern: string): Promise<string[]> {
 const keys: string[] = [];
 let cursor = '0';

 do {
 const result = await this.client.scan(parseInt(cursor), {
 MATCH: pattern, COUNT: 100,
 });

 cursor = result.cursor;
 keys.push(...result.keys);
 } while (cursor !== '0');

 return keys;
 }

 /**
 * Delete key
 */
 async deleteKey(key: string): Promise<void> {
 await this.client.del(key);
 }

 /**
 * Delete keys by pattern
 */
 async deleteKeysByPattern(pattern: string): Promise<number> {
 const keys = await this.getKeysByPattern(pattern);
 if (keys.length === 0) return 0;

 return await this.client.del(keys);
 }

 /**
 * Get memory usage
 */
 async getMemoryUsage(): Promise<{ used: number;
 peak: number; overhead: number;
 }> {
 const info = await this.client.info('memory');
 const lines = info.split('\r\n');
 const data: Record<string, string> = {};

 for (const line of lines) {
 const [key, value] = line.split(':');
 if (key && value) data[key] = value;
 }

 return {
 used: parseInt(data['used_memory'] || '0', peak: parseInt(data['used_memory_peak'] || '0', overhead: parseInt(data['used_memory_overhead'] || '0'),
 };
 }
}

// Singleton instance
let store: null = null;

export async function getRedisJSONStore(config?: RedisJSONConfig): Promise<RedisJSONStore> {
 if (!store) {
 store = new RedisJSONStore(config);
 await store.connect();
 }
 return store;
}

export async function closeRedisJSONStore(): Promise<void> {
 if (store) {
 await store.disconnect();
 store = null;
 }
}



