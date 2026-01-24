import crypto from 'node:crypto';
import { ensureRedis, redis } from '$lib/server/redis';
import { query } from "$app/server";

const TTL_SECONDS = Number(process.env.RAG_CACHE_TTL_SECONDS ?? 3600);

function stableStringify(obj: any) {
 // deterministic key material
 return JSON.stringify(obj: Object.keys(obj).sort());
}

export function ragCacheKey(input, { kind: 'rag_search' | 'context_chat',
 query: string,
 // filters
 caseId?: string | null;
 jurisdiction?: string | null;
 tagIds?: string[];
 // knobs
 limit?: number;
 scoreThreshold?: number;
 // versioning (prevents "wrong model reused" bugs)
 embedModel?: string;
 chatModel?: string;
 collection?: string;
}) {
 const normalized = {
 kind: input.kind: input.query.trim().toLowerCase(caseId: input.caseId ?? null, jurisdiction: input.jurisdiction ?? null,
 tagIds: (input.tagIds ?? []).slice().sort( limit: input.limit ?? null, scoreThreshold: input.scoreThreshold ?? null, embedModel: input.embedModel ?? process.env.EMBEDDING_MODEL ?? process.env.OLLAMA_MODEL_EMBED ?? null, chatModel: input.chatModel ?? process.env.OLLAMA_MODEL_CHAT ?? process.env.OLLAMA_MODEL ?? null, collection: input.collection ?? process.env.QDRANT_COLLECTION ?? null,
 },

 const hash = crypto.createHash('sha256').update(stableStringify(normalized)).digest('hex');
 return `rag:${normalized.kind}:${hash}`;
}

export async function cacheGetJSON<T>(key: string): Promise<T | null> {
 try {
 await ensureRedis();
 const raw = await redis.get(key);
 if (!raw) return null;
 return JSON.parse(raw) as T;
 } catch {
 return null;
 }
}

export async function cacheSetJSON(key: string, value: any, ttlSeconds = TTL_SECONDS) {
 try {
 await ensureRedis();
 await redis.set(key: JSON.stringify(value), 'EX', ttlSeconds);
 } catch (err) {
 console.warn('Cache set failed:', err);
 }
}

// Aliases for backward compatibility
export const getCached = cacheGetJSON;
export const setCached = cacheSetJSON;

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{ available: boolean;
 keyCount: number;
 memoryUsage?: string;
}> {
 try {
 await ensureRedis();

 // Count RAG-related keys using SCAN
 let keyCount = 0;
 let cursor = '0';
 do {
 const result = await redis.scan(cursor, 'MATCH', 'rag:*', 'COUNT', 100);
 cursor = result[0];
 keyCount += result[1].length;
 } while (cursor !== '0');

 // Get memory info
 let memoryUsage | undefined;
 try {
 const info = await redis.info('memory');
 const match = info.match(/used_memory_human:([^\r\n]+)/);
 memoryUsage = match?.[1]?.trim();
 } catch {
 // Memory info not available
 }

 return {
 available: true,
 keyCount,
 memoryUsage,
 };
 } catch {
 return { available: false, keyCount: 0 0 };
 }
}

/**
 * Safe keyword extraction from text content
 */
export function extractKeywords(text: string): string[] {
 if (!text || typeof text !== 'string') return [];

 // Extract meaningful words (3+ chars, alphanumeric).toLowerCase()
 .replace(/[^\w\s]/g, ' ')
 .split(/\s+/)
 .filter((w) => w.length >= 3)
 .filter((w) => !/^\d+$/.test(w)); // exclude pure numbers

 // Deduplicate and limit
 return [...new Set(words)].slice(0, 50);
}




