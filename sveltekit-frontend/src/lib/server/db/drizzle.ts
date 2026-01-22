/**
 * Unified Drizzle + Vector + Storage utilities
 * Generates a small integration layer over the existing db client, qdrant and minio helpers
 */

import qdrantClient from '$lib/services/qdrant-client';
import { eq, sql } from 'drizzle-orm';
import { Client as MinioClient } from 'minio';
import lazyDb from './client.js';
import * as schema from './schema.ts';

const _CFG: Record<string, any> =
	typeof globalThis !== 'undefined' && (globalThis as any)._CFG
		? (globalThis as any)._CFG
		: {};

// Lazy-load project's cache/redis helper at runtime
let _cacheInitialized = false;
let _cache: any | undefined = undefined;

async function getCache(): Promise<any | undefined> {
	if (_cacheInitialized) return _cache;
	_cacheInitialized = true;
	try {
		const mod = await import('$lib/server/cache/redis');
		_cache = (mod as any).default ?? mod;
	} catch (err) {
		_cache = undefined;
	}
	return _cache;
}

export const schemaDb = schema;
export const db = lazyDb.db;
export const adminDb = lazyDb.adminDb;

// Re-export sql for convenience
export { sql };

// Cached query helper using Redis
export async function cachedQuery<T>(
	key: string,
	queryFn: () => Promise<T>,
	ttlMs = 1000 * 60 * 10
): Promise<T> {
	try {
		const cache = await getCache();
		if (cache && typeof cache.get === 'function') {
			const cached = await cache.get(key);
			if (cached) return cached as T;
		}
	} catch (err) {
		console.warn('⚠️ Cache read failed:', err);
	}

	const result = await queryFn();

	try {
		const cache = await getCache();
		if (cache && typeof cache.set === 'function') {
			await cache.set(key, result, ttlMs);
		}
	} catch (err) {
		console.warn('⚠️ Cache write failed:', err);
	}
	return result;
}

// Hybrid vector search: prefer qdrant, fallback to pgvector via SQL
export async function hybridVectorSearch<T = unknown>(
	embedding: number[],
	table: unknown,
	column: unknown,
	limit = 10
): Promise<unknown[]> {
	try {
		if (qdrantClient) {
			const qResults = await (qdrantClient as any).search({
				collectionName: _CFG.QDRANT_COLLECTION ?? 'legal_embeddings',
				vector: embedding,
				limit
			});
			if (Array.isArray(qResults) && qResults.length > 0) return qResults;
		}
	} catch (err) {
		console.warn('⚠️ Qdrant search failed, falling back to pgvector:', err);
	}

	// Fallback to pgvector
	try {
		const rows = await (db as any)
			.select()
			.from(table as any)
			.orderBy(sql`${column as any} <#> ${sql.array(embedding)}`)
			.limit(limit)
			.execute();
		return Array.isArray(rows) ? rows : [];
	} catch (err) {
		console.error('❌ pgvector fallback failed:', err);
		return [];
	}
}

// Store embedding in Postgres + Qdrant + Redis cache
export async function storeEmbedding(
	table: unknown,
	recordId: string,
	vectorColumn: { name?: string } | undefined,
	embedding: number[],
	metadata: Record<string, unknown> = {}
): Promise<void> {
	try {
		await (db as any)
			.update(table as any)
			.set({ [(vectorColumn as any)?.name ?? 'embedding']: embedding })
			.where(eq((table as any).id, recordId))
			.execute();
	} catch (err) {
		console.warn('⚠️ Failed to update embedding in Postgres:', err);
	}

	try {
		if (qdrantClient) {
			await (qdrantClient as any).upsert({
				collectionName: _CFG.QDRANT_COLLECTION ?? 'legal_embeddings',
				points: [{ id: recordId, vector: embedding, payload: metadata }]
			});
		}
	} catch (err) {
		console.warn('⚠️ Failed to upsert to Qdrant:', err);
	}

	try {
		const cache = await getCache();
		if (cache && typeof cache.set === 'function') {
			await cache.set(`embedding:${recordId}`, metadata, 24 * 60 * 60 * 1000);
		}
	} catch (err) {
		// ignore cache write errors
	}
}

// MinIO helper
function makeMinioClient(): MinioClient {
	const endpoint = _CFG.MINIO_ENDPOINT ?? process.env.MINIO_ENDPOINT ?? 'localhost:9000';
	const accessKey = _CFG.MINIO_ACCESS_KEY ?? process.env.MINIO_ACCESS_KEY ?? 'minioadmin';
	const secretKey = _CFG.MINIO_SECRET_KEY ?? process.env.MINIO_SECRET_KEY ?? 'minioadmin';
	const useSSL = String(endpoint).startsWith('https');

	const [host, portStr] = endpoint.split(':');
	const port = parseInt(portStr ?? '9000', 10);

	return new MinioClient({
		endPoint: host,
		port,
		useSSL,
		accessKey,
		secretKey
	});
}

export async function fetchDocumentFromMinIO(bucket: string, key: string): Promise<string> {
	try {
		const client = makeMinioClient();
		const stream = await client.getObject(bucket, key);
		const chunks: Buffer[] = [];
		for await (const chunk of stream) chunks.push(chunk as Buffer);
		return Buffer.concat(chunks).toString('utf8');
	} catch (err) {
		console.error(`❌ Failed to fetch from MinIO: ${bucket}/${key}`, err);
		return '';
	}
}

export default db;
