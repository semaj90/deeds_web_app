import { getRedisClient } from '../redis/client.js';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';

interface RAGCacheEntry {
	query: string;
	response: any;
	timestamp: number;
	ttl: number;
}

export class RAGCache {
	private namespace = 'rag';

	async get(query: string): Promise<any | null> {
		try {
			const client = await getRedisClient();
			const key = `${this.namespace}:${query}`;
			const cached = await client.get(key);

			if (!cached) {
				return null;
			}

			const entry: RAGCacheEntry = JSON.parse(cached);

			// Check if expired
			if (Date.now() > entry.timestamp + entry.ttl * 1000) {
				await this.delete(query);
				return null;
			}

			return entry.response;
		} catch (error) {
			console.error('RAG Cache get error:', error);
			return null;
		}
	}

	async set(query: string, response: any, ttl: number = 3600): Promise<void> {
		try {
			const client = await getRedisClient();
			const key = `${this.namespace}:${query}`;
			const entry: RAGCacheEntry = {
				query,
				response,
				timestamp: Date.now(),
				ttl,
			};

			await client.setex(key, ttl, JSON.stringify(entry));
		} catch (error) {
			console.error('RAG Cache set error:', error);
		}
	}

	async delete(query: string): Promise<void> {
		try {
			const client = await getRedisClient();
			const key = `${this.namespace}:${query}`;
			await client.del(key);
		} catch (error) {
			console.error('RAG Cache delete error:', error);
		}
	}

	async clear(): Promise<void> {
		try {
			const client = await getRedisClient();
			const keys = await client.keys(`${this.namespace}:*`);
			if (keys.length > 0) {
				await client.del(keys);
			}
		} catch (error) {
			console.error('RAG Cache clear error:', error);
		}
	}
}

export const ragCache = new RAGCache();

