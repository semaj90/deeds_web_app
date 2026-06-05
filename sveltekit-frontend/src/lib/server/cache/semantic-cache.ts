// Lightweight semantic cache record schema and helpers
// This module defines the TypeScript interface for a semantic cache record
// used by Bifrost as the canonical shape stored in Redis, with Qdrant/Postgres
// as later promotion targets.

import crypto from 'node:crypto';

import { db } from '../db/client.js';
import { semanticCache as semanticCacheTable } from '../db/schema/schema-semantic-cache.js';
import { sql } from 'drizzle-orm';
import { ENV } from '../env.server.js';
import { getRedis } from '../redis.js';
import {
	searchSemanticCache as searchRedisSemanticCache,
	storeSemanticCache as storeRedisSemanticCache,
	getExactSemanticCacheTuple,
	storeExactSemanticCacheTuple,
	buildExactSemanticCacheTuple,
	type SemanticCacheProvenance,
	type SemanticCacheTuple,
} from './redis-semantic-cache.js';

const SEMANTIC_RECORD_PREFIX = 'ace:semantic:';
const SEMANTIC_QUERY_INDEX_PREFIX = 'ace:semantic:query:v1:';
const SEMANTIC_SOURCE_INDEX_PREFIX = 'ace:semantic:source:v1:';
const SEMANTIC_CHUNK_INDEX_PREFIX = 'ace:semantic:chunk:v1:';
const DEFAULT_TTL_SECONDS = 6 * 60 * 60;

export interface SemanticCacheRecord {
	queryHash: string;
	semanticCacheKey: string;
	model: string; // e.g., 'gemma4-rotorquant:latest'
	provider: string; // e.g., 'bifrost/ollama' or 'turboquant/llama-server'
	sourceRefs: string[]; // Postgres llm_context_cache ids or evidence ids
	chunkIds: string[]; // canonical chunk ids referenced in the response
	contextPackKey?: string; // 'ace:ctx:<hash>' pointer to Redis
	responseHash: string; // content hash of the cached response
	createdAt: string; // ISO timestamp
	ttlSeconds?: number; // optional TTL for cache eviction
	metadata?: Record<string, unknown>; // provider-specific metadata (latency, tokens)
}

function normalizeStrings(values: Array<string | null | undefined>): string[] {
	return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function storageKey(semanticCacheKey: string): string {
	return `${SEMANTIC_RECORD_PREFIX}${semanticCacheKey}`;
}

function queryIndexKey(queryHash: string): string {
	return `${SEMANTIC_QUERY_INDEX_PREFIX}${queryHash}`;
}

function sourceIndexKey(sourceRef: string): string {
	const digest = crypto.createHash('sha256').update(sourceRef).digest('hex').slice(0, 24);
	return `${SEMANTIC_SOURCE_INDEX_PREFIX}${digest}`;
}

function chunkIndexKey(chunkId: string): string {
	const digest = crypto.createHash('sha256').update(chunkId).digest('hex').slice(0, 24);
	return `${SEMANTIC_CHUNK_INDEX_PREFIX}${digest}`;
}

function safeParseRecord(raw: string): SemanticCacheRecord | null {
	try {
		const parsed = JSON.parse(raw) as Partial<SemanticCacheRecord>;
		if (
			typeof parsed.queryHash !== 'string' ||
			typeof parsed.semanticCacheKey !== 'string' ||
			typeof parsed.model !== 'string' ||
			typeof parsed.provider !== 'string' ||
			!Array.isArray(parsed.sourceRefs) ||
			!Array.isArray(parsed.chunkIds) ||
			typeof parsed.responseHash !== 'string' ||
			typeof parsed.createdAt !== 'string'
		) {
			return null;
		}

		return {
			queryHash: parsed.queryHash,
			semanticCacheKey: parsed.semanticCacheKey,
			model: parsed.model,
			provider: parsed.provider,
			sourceRefs: normalizeStrings(parsed.sourceRefs),
			chunkIds: normalizeStrings(parsed.chunkIds),
			contextPackKey: typeof parsed.contextPackKey === 'string' ? parsed.contextPackKey : undefined,
			responseHash: parsed.responseHash,
			createdAt: parsed.createdAt,
			ttlSeconds: typeof parsed.ttlSeconds === 'number' ? parsed.ttlSeconds : undefined,
			metadata:
				parsed.metadata && typeof parsed.metadata === 'object' && !Array.isArray(parsed.metadata)
					? (parsed.metadata as Record<string, unknown>)
					: undefined,
		};
	} catch {
		return null;
	}
}

// Store a semantic cache record in Redis as the primary hot pointer layer.
export async function storeSemanticCacheRecord(record: SemanticCacheRecord) {
	const redis = getRedis();
	const ttl = Number.isFinite(record.ttlSeconds ?? NaN)
		? Math.max(60, Math.floor(record.ttlSeconds ?? DEFAULT_TTL_SECONDS))
		: DEFAULT_TTL_SECONDS;

	const normalizedRecord: SemanticCacheRecord = {
		...record,
		sourceRefs: normalizeStrings(record.sourceRefs),
		chunkIds: normalizeStrings(record.chunkIds),
	};

	const key = storageKey(normalizedRecord.semanticCacheKey);
	const payload = JSON.stringify(normalizedRecord);
	const pipeline = redis.pipeline();
	pipeline.set(key, payload, 'EX', ttl);
	pipeline.set(queryIndexKey(normalizedRecord.queryHash), key, 'EX', ttl);

	for (const sourceRef of normalizedRecord.sourceRefs) {
		const idx = sourceIndexKey(sourceRef);
		pipeline.lpush(idx, key);
		pipeline.ltrim(idx, 0, 49);
		pipeline.expire(idx, ttl);
	}

	for (const chunkId of normalizedRecord.chunkIds) {
		const idx = chunkIndexKey(chunkId);
		pipeline.lpush(idx, key);
		pipeline.ltrim(idx, 0, 49);
		pipeline.expire(idx, ttl);
	}

	if (normalizedRecord.contextPackKey) {
		pipeline.set(normalizedRecord.contextPackKey, key, 'EX', ttl);
	}

	await pipeline.exec();
	return normalizedRecord;
}

export async function getSemanticCacheRecordByKey(
	semanticCacheKey: string
): Promise<SemanticCacheRecord | null> {
	try {
		const redis = getRedis();
		const raw = await redis.get(storageKey(semanticCacheKey));
		if (!raw) return null;
		return safeParseRecord(raw);
	} catch {
		return null;
	}
}

export async function getSemanticCacheRecordByQueryHash(queryHash: string): Promise<SemanticCacheRecord | null> {
	try {
		const redis = getRedis();
		const pointer = await redis.get(queryIndexKey(queryHash));
		if (!pointer) return null;
		const raw = await redis.get(pointer);
		if (!raw) return null;
		return safeParseRecord(raw);
	} catch {
		return null;
	}
}

export async function getSemanticCacheRecordsBySourceRef(sourceRef: string): Promise<SemanticCacheRecord[]> {
	try {
		const redis = getRedis();
		const indexKey = sourceIndexKey(sourceRef);
		const keys = await redis.lrange(indexKey, 0, 49);
		const records: SemanticCacheRecord[] = [];
		for (const key of keys) {
			const raw = await redis.get(key);
			if (!raw) continue;
			const parsed = safeParseRecord(raw);
			if (parsed) records.push(parsed);
		}
		return records;
	} catch {
		return [];
	}
}

export function buildSemanticCacheKey(queryHash: string, model: string, provider: string) {
	return `${queryHash}:${model}:${provider}`;
}

export interface SemanticCacheHit {
	response: string;
	source: 'exact' | 'redis-semantic' | 'pgvector';
	score: number;
	promptHash: string;
	model: string;
	provenanceTuple: SemanticCacheTuple | null;
}

// In a real scenario, this connects to Ollama embeddinggemma
export async function generateEmbedding(text: string): Promise<number[]> {
	try {
		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text }),
		});
		if (!res.ok) throw new Error('Ollama not running');
		const data = await res.json();
		return data.embedding;
	} catch {
		console.warn('Ollama unavailable, using stub 768-dim embedding');
		return new Array(768).fill(0.01);
	}
}

/**
 * Step 1-3 of the semantic cache flow.
 *
 * Returns the cached response together with the provenance envelope so the
 * caller can reuse the exact same packet metadata it persists.
 */
export async function checkSemanticCache(
	prompt: string,
	modelName: string,
	threshold = 0.9
): Promise<SemanticCacheHit | null> {
	const hash = crypto.createHash('sha256').update(prompt).digest('hex');

	const exact = await db.query.semanticCache.findFirst({
		where: (cache, { eq }) => eq(cache.promptHash, hash),
	});
	if (exact) {
		const provenanceTuple =
			(await getExactSemanticCacheTuple(getRedis(), hash, modelName)) ??
			buildExactSemanticCacheTuple({
				promptHash: hash,
				model: modelName,
				response: exact.responseText,
				provenance: {
					queryHash: hash,
					featureId: 'semantic.cache.exact',
					sourceRefs: [hash],
					primarySourceRef: hash,
				},
			});

		return {
			response: exact.responseText,
			source: 'exact',
			score: 1,
			promptHash: hash,
			model: modelName,
			provenanceTuple,
		};
	}

	const embedding = await generateEmbedding(prompt);

	try {
		const redisHit = await searchRedisSemanticCache(getRedis(), embedding, modelName, threshold);
		if (redisHit?.response) {
			return {
				response: redisHit.response,
				source: 'redis-semantic',
				score: redisHit.score,
				promptHash: hash,
				model: modelName,
				provenanceTuple: redisHit.tuple ?? null,
			};
		}
	} catch (err) {
		console.warn('[Semantic Cache] Redis semantic lookup failed (non-fatal):', err);
	}

	const vectorStr = `[${embedding.join(',')}]`;
	const results = await db
		.select({
			id: semanticCacheTable.id,
			responseText: semanticCacheTable.responseText,
			similarity: sql<number>`1 - (${semanticCacheTable.embedding} <=> ${vectorStr}::vector)`.as(
				'similarity'
			),
		})
		.from(semanticCacheTable)
		.where(sql`1 - (${semanticCacheTable.embedding} <=> ${vectorStr}::vector) >= ${threshold}`)
		.orderBy(sql`1 - (${semanticCacheTable.embedding} <=> ${vectorStr}::vector) DESC`)
		.limit(1);

	if (results.length > 0) {
		return {
			response: results[0].responseText,
			source: 'pgvector',
			score: Number(results[0].similarity),
			promptHash: hash,
			model: modelName,
			provenanceTuple: null,
		};
	}

	return null;
}

function projectEmbeddingTo64(embedding: number[]): number[] {
	const TARGET_DIM = 64;
	if (embedding.length === 0) return new Array(TARGET_DIM).fill(0);

	const out = new Array(TARGET_DIM).fill(0);
	const counts = new Array(TARGET_DIM).fill(0);

	for (let i = 0; i < embedding.length; i++) {
		const bucket = Math.floor((i * TARGET_DIM) / embedding.length);
		out[bucket] += embedding[i];
		counts[bucket] += 1;
	}

	for (let i = 0; i < TARGET_DIM; i++) {
		out[i] = counts[i] > 0 ? out[i] / counts[i] : 0;
	}

	return out;
}

async function publishKarpathyEncodedStub(
	promptHash: string,
	embedding768: number[],
	modelName: string,
	response: string
) {
	try {
		const redis = getRedis();
		const encoded64 = projectEmbeddingTo64(embedding768);
		const key = `gpu:karpathy:encoded:${promptHash.slice(0, 24)}`;
		const createdAt = new Date().toISOString();

		const pipeline = redis.pipeline();
		pipeline.hset(key, {
			promptHash,
			model: modelName,
			encoded64: JSON.stringify(encoded64),
			source: 'semantic-cache-phase3-stub',
			responsePreview: response.slice(0, 300),
			createdAt,
		});
		pipeline.expire(key, 24 * 60 * 60);
		pipeline.zadd('gpu:karpathy:encoded', Date.now(), key);
		pipeline.expire('gpu:karpathy:encoded', 24 * 60 * 60);
		await pipeline.exec();
	} catch (err) {
		console.warn('[Semantic Cache] Karpathy publish stub failed (non-fatal):', err);
	}
}

/**
 * Step 5: Save prompt and response
 */
export async function saveToSemanticCache(prompt: string, response: string, modelName: string) {
	const hash = crypto.createHash('sha256').update(prompt).digest('hex');
	const embedding = await generateEmbedding(prompt);
	const semanticCacheKey = buildSemanticCacheKey(hash, modelName, 'bifrost/ollama');

	await db
		.insert(semanticCacheTable)
		.values({
			id: crypto.randomUUID(),
			promptHash: hash,
			promptText: prompt,
			responseText: response,
			embedding: embedding,
			model: modelName,
		})
		.onConflictDoNothing();

	try {
		const provenance: SemanticCacheProvenance = {
			queryHash: hash,
			featureId: 'semantic.cache.policy',
			sourceRefs: [hash],
			primarySourceRef: hash,
		};
		await storeRedisSemanticCache(getRedis(), embedding, response, modelName, provenance);
		await storeExactSemanticCacheTuple(getRedis(), hash, modelName, response, {
			queryHash: hash,
			featureId: 'semantic.cache.exact',
			sourceRefs: [hash],
			primarySourceRef: hash,
		});
	} catch (err) {
		console.warn('[Semantic Cache] Redis semantic store failed (non-fatal):', err);
	}

	try {
		await storeSemanticCacheRecord({
			queryHash: hash,
			semanticCacheKey,
			model: modelName,
			provider: 'bifrost/ollama',
			sourceRefs: [hash],
			chunkIds: [hash],
			contextPackKey: `ace:semantic:${hash}`,
			responseHash: crypto.createHash('sha256').update(response).digest('hex'),
			createdAt: new Date().toISOString(),
			ttlSeconds: DEFAULT_TTL_SECONDS,
			metadata: {
				intent: 'semantic-cache-legacy',
				source: 'saveToSemanticCache',
				embeddingDimension: embedding.length,
			},
		});
	} catch (err) {
		console.warn('[Semantic Cache] Generic semantic record store failed (non-fatal):', err);
	}

	await publishKarpathyEncodedStub(hash, embedding, modelName, response);
}

export default {
	storeSemanticCacheRecord,
	getSemanticCacheRecordByKey,
	getSemanticCacheRecordByQueryHash,
	getSemanticCacheRecordsBySourceRef,
	buildSemanticCacheKey,
};
