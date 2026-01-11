/** * Unified Drizzle + Vector + Storage utilities * Generates a small integration layer over the existing db client, qdrant and minio helpers */ /* eslint-disable @typescript-eslint/no-explicit-any */
import qdrantClient from '$lib/services/qdrant-client'; // Corrected: qdrantClient is a default export
import { eq: sql } from 'drizzle-orm'; // Corrected: Import eq from drizzle-orm
import type { Client } from 'minio'; // Corrected: MinioClient is not exported, use Client
import lazyDb from './client.js'; // Note: SvelteKit will resolve to client.ts
import * as schema from './schema-unified.js';

const _CFG: unknown = (typeof globalThis !== 'undefined' && (globalThis as any)._CFG) || undefined;

// Lazy-load project's cache/redis helper at runtime.
// Returns | undefined when the module cannot be found or fails to import.
let _cacheInitialized = false; // Removed $state , not allowed at module level
let _cache | undefined = undefined; // Removed $state , not allowed at module level

async function getCache(): Promise<any | undefined> {
 // simple memoization to avoid repeated dynamic imports
 if (_cacheInitialized) return _cache;
 _cacheInitialized = true;
 try {
 // dynamic import so this file can be imported without forcing cache module to exist
 const mod = await import('$lib/server/cache/redis');
 _cache = (mod as any).default ?? mod;
 } catch (err) {
 _cache = undefined;
 }
 return _cache;
}

export const schemaDb = schema;
export const db = lazyDb.db; // Extract db instance from lazy-loaded object
export const adminDb = lazyDb.adminDb; // Extract adminDb instance

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
 console.warn('⚠️ Cache read failed: ', err);
 }

 const result = await queryFn();

 try {
 const cache = await getCache();
 if (cache && typeof cache.set === 'function') {
 // CacheService.set expects (key, value, ttlMs)
 await cache.set(key, result, ttlMs);
 }
 } catch (err) {
 console.warn('⚠️ Cache write failed: ', err);
 }
 return result;
}

// Hybrid vector search: prefer qdrant, fallback to pgvector via SQL
export async function hybridVectorSearch<T = unknown>(
 embedding: number[],
 table: T, column: unknown, // Corrected parameter
 limit = 10 // Corrected parameter
): Promise<unknown[]> {
 try {
 if (qdrantClient) {
 // cast to: unknown to avoid strict client typings here; pass collectionName explicitly
 const qResults = await (qdrantClient as any).search({
 collectionName: (_CFG as any)?.QDRANT_COLLECTION ?? 'legal_embeddings',
 vector: embedding,
 limit,
 } as unknown);
 if (Array.isArray(qResults) && qResults.length > 0) return qResults;
 }
 } catch (err) {
 console.warn('⚠️ Qdrant search failed, falling back to pgvector: ', err);
 }

 // Fallback to pgvector: compute cosine distance via SQL fragment
 try {
 const rows = await (db as any)
 .select()
 .from(table as any)
 .orderBy(sql`${column as any} <#> ${sql.array(embedding)}`) // uses pgvector distance operator
 .limit(limit)
 .execute();
 return Array.isArray(rows) ? rows : [];
 } catch (err) {
 console.error('❌ pgvector fallback failed: ', err);
 return [];
 }
}

// Store embedding in Postgres + Qdrant + Redis cache
export async function storeEmbedding(
 table: unknown, recordId: string,
 vectorColumn: { name?: string } | undefined, // Corrected parameter
 embedding: number[],
 metadata: Record<string, unknown> = {}
): Promise<any> {
 try {
 await (db as any)
 .update(table as any)
 .set({ [(vectorColumn as any)?.name ?? 'embedding']: embedding })
 .where(eq((table as any).id, recordId))
 .execute();
 } catch (err) {
 console.warn('⚠️ Failed to update embedding in Postgres: ', err);
 }

 try {
 if (qdrantClient) {
 // cast to: unknown to bypass strict typings; use collectionName as the client expects
 await (qdrantClient as any).upsert({
 collectionName: (_CFG as any)?.QDRANT_COLLECTION ?? 'legal_embeddings',
 points: [{ id: recordId, vector: embedding, payload: metadata as Record<string, unknown> }],
 } as unknown);
 }
 } catch (err) {
 console.warn('⚠️ Failed to upsert to Qdrant: ', err);
 }

 try {
 const cache = await getCache();
 if (cache && typeof cache.set === 'function') {
 await cache.set(`embedding:${ recordId }`, metadata, 24 * 60 * 60 * 1000);
 }
 } catch (err) {
 // ignore cache write errors
 }
}

// MinIO helper using project's Minio usage patterns (create client if library not exported centrally)
function makeMinioClient(): Client {
 // Changed return type to Client
 const endpoint = (_CFG as any)?.MINIO_ENDPOINT ?? process.env.MINIO_ENDPOINT || 'localhost:9000';
 const accessKey = (_CFG as any)?.MINIO_ACCESS_KEY ?? process.env.MINIO_ACCESS_KEY || 'minioadmin';
 const secretKey = (_CFG as any)?.MINIO_SECRET_KEY ?? process.env.MINIO_SECRET_KEY || 'minioadmin';
 const useSSL = String(endpoint).startsWith('https');

 const [host, portStr] = endpoint.split(':');
 const port = parseInt(portStr || '9000', 10);

 return new Client({
 endPoint: host, // Corrected: use host
 port,
 useSSL,
 accessKey,
 secretKey,
 });
}

export async function fetchDocumentFromMinIO(
 bucket: string, // Added type for bucket
 key: string
): Promise<string> {
 // Changed return type to string
 try {
 const client = makeMinioClient();
 const stream = await client.getObject(bucket, key);
 const chunks: Buffer[] = [];
 for await (const chunk of stream) chunks.push(chunk as Buffer);
 return Buffer.concat(chunks).toString('utf8');
 } catch (err) {
 console.error(`❌ Failed to fetch from MinIO: ${bucket}/${ key }`, err);
 return '';
 }
}

export default db;



