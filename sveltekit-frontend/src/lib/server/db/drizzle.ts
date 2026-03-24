/**
 * Unified Drizzle + Vector + Storage utilities
 * Generates a small integration layer over the existing db client, qdrant and minio helpers
 */

import qdrantClient from '$lib/services/qdrant-client';
import { eq, sql } from 'drizzle-orm';
import { getFile as getMinioFile } from '$lib/server/minio-client.js';
import lazyDb from './client.js';
import * as schema from './schema.js';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';

const _CFG: Record<string, any> =
  typeof globalThis !== 'undefined' && (globalThis as any)._CFG ? (globalThis as any)._CFG : {};

// Lazy-load project's cache/redis helper at runtime
let _cacheInitialized = false;
let _cache: any | undefined = undefined;

async function getCache(): Promise<any | undefined> {
  if (_cacheInitialized) return _cache;
  _cacheInitialized = true;
  try {
    const cachePath = '$lib/server/cache/redis';
    const mod = await import(/* @vite-ignore */ cachePath);
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
        limit,
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
      .orderBy(sql`${column as any} <#> ARRAY[${sql.raw(embedding.join(','))}]::vector`)
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
				points: [{
	id: recordId, vector: embedding, payload: metadata }]
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

export async function fetchDocumentFromMinIO(bucket: string, key: string): Promise<string> {
	try {
		const buf = await getMinioFile(bucket, key);
		return buf.toString('utf8');
	} catch (err) {
		console.error(`Failed to fetch from MinIO: ${bucket}/${key}`, err);
		return '';
	}
}

export default db;

