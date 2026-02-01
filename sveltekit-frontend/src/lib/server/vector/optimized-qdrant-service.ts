/**
 * Optimized Qdrant Vector Service
 * - Integrates Redis + EmbeddingGemma + Qdrant vector database
 * - Provides high-level methods for semantic search and vector upserts
 * - Supports hybrid caching and async lazy embedding
 */

import { embeddingGemma } from '$lib/server/ai/embeddinggemma-service';
import { cache } from '$lib/server/cache/redis';
import { qdrantClient } from '$lib/server/vector/qdrant';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/* -------------------------------------------------------------------------- */
/* Config */
/* -------------------------------------------------------------------------- */

const COLLECTION_NAME = process.env.QDRANT_COLLECTION ?? 'legal_embeddings';
const EMBEDDING_MODEL = process.env.EMBED_MODEL ?? 'embeddinggemma:latest';
const DEFAULT_TOP_K = 5;

/* -------------------------------------------------------------------------- */
/* Local types */
/* -------------------------------------------------------------------------- */

type Vector = number[];

interface QdrantPoint {
    id: string | number;
    vector?: Vector;
    payload?: Record<string, unknown>;
    score?: number;
}

/* -------------------------------------------------------------------------- */
/* Helpers */
/* -------------------------------------------------------------------------- */

function formatError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
}

async function getCachedEmbedding(text: string, model: string): Promise<number[] | null> {
    const key = `embedding:${model}:${text.substring(0, 64)}`; // Truncate key for safety, maybe hash it in real app
    return await cache.get<number[]>(key);
}

async function cacheEmbedding(text: string, model: string, embedding: number[]): Promise<void> {
    const key = `embedding:${model}:${text.substring(0, 64)}`;
    // Cache for 24h
    await cache.set(key, embedding, 86400);
}

/* -------------------------------------------------------------------------- */
/* Embedding helper (cache + service) */
/* -------------------------------------------------------------------------- */

/**
 * embedText
 * - tries Redis cache via getCachedEmbedding
 * - falls back to embeddingGemma
 * - caches result via cacheEmbedding
 */
async function embedText(text: string, model: string = EMBEDDING_MODEL): Promise<number[]> {
    try {
        // Try cache first
        const cached = await getCachedEmbedding(text, model).catch(() => null);
        if (Array.isArray(cached) && cached.length) return cached;

        // Call underlying embedding service
        const response = await embeddingGemma.embed(text, { model });
        const emb = response.embedding;

        if (!Array.isArray(emb) || !emb.length) return [];

        // Cache the produced embedding
        try {
            await cacheEmbedding(text, model, emb);
        } catch (err) {
            console.warn('cacheEmbedding warning:', formatError(err));
        }

        return emb;
    } catch (err) {
        console.error('embedText error:', formatError(err));
        return [];
    }
}

/* -------------------------------------------------------------------------- */
/* Vector Utility Helpers */
/* -------------------------------------------------------------------------- */

/**
 * Ensures the Qdrant collection exists.
 */
export async function ensureCollection(dim: number): Promise<void> {
    try {
        const result = await qdrantClient.getCollections();
        const exists = result.collections.some(c => c.name === COLLECTION_NAME);

        if (!exists) {
            console.log(`[Qdrant] Creating collection ${COLLECTION_NAME} (${dim} dims)`);
            await qdrantClient.createCollection(COLLECTION_NAME, {
                vectors: {
	size: dim,
                    distance: 'Cosine'
                }
            });
        }
    } catch (err) {
        console.error('ensureCollection error:', formatError(err));
    }
}

/* -------------------------------------------------------------------------- */
/* Core Vector Operations */
/* -------------------------------------------------------------------------- */

/**
 * Inserts or updates a vector into Qdrant.
 */
export async function upsertVector(
    id: string,
    vector: number[],
    payload: Record<string, unknown> = {}
): Promise<boolean> {
    try {
        await ensureCollection(vector.length);
        await qdrantClient.upsert(COLLECTION_NAME, {
            points: [
                {
                    id,
                    vector,
                    payload: { id, ...payload }
                }
            ],
            wait: true
        });
        return true;
    } catch (err) {
        console.error('upsertVector error:', formatError(err));
        return false;
    }
}

/**
 * Fetches a single vector point from Qdrant by ID.
 */
export async function getVectorById(id: string | number): Promise<QdrantPoint | null> {
    try {
        const res = await qdrantClient.retrieve(COLLECTION_NAME, {
            ids: [id],
            with_vector: true,
            with_payload: true
        });

        if (Array.isArray(res) && res.length > 0) {
            const point = res[0];
            return {
                id: point.id,
                vector: point.vector as number[], // Assuming plain vector
                payload: point.payload,
            };
        }
        return null;
    } catch (err) {
        console.error('getVectorById error:', formatError(err));
        return null;
    }
}

/**
 * Performs a similarity search against Qdrant.
 * Optionally caches results in Redis for repeated queries.
 */
export async function semanticSearch(
    query: string,
    options: { topK?: number; filter?: Record<string, unknown>; useCache?: boolean } = {}
): Promise<QdrantPoint[]> {
    const { topK = DEFAULT_TOP_K, filter = {},
	useCache = true } = options;

    try {
        // Step 1: Embed query text
        const vector = await embedText(query, EMBEDDING_MODEL);
        if (!vector?.length) return [];

        // Step 2: Ensure collection exists (lazy init)
        await ensureCollection(vector.length);

        // Build filter if needed (simple key-value matching for now)
        // Qdrant filter structure is a bit complex, sticking to simple MUST match for passed keys
        let qdrantFilter: any = undefined;
        if (Object.keys(filter).length > 0) {
            const conditions = Object.entries(filter).map(([key, value]) => ({
                key,
                match: { value }
            }));
             qdrantFilter = { must: conditions };
        }

        const results = await qdrantClient.search(COLLECTION_NAME, {
            vector,
            limit: topK,
            filter: qdrantFilter,
            with_payload: true
        });

        const points: QdrantPoint[] = results.map(r => ({
            id: r.id,
            vector: r.vector as number[] | undefined,
            payload: r.payload,
            score: r.score
        }));

        return points;
    } catch (err) {
        console.error('semanticSearch error:', formatError(err));
        return [];
    }
}

/**
 * Hybrid semantic fetch (Backward compatibility wrapper)
 */
export async function hybridSemanticFetch(
    text: string,
    opts: { topK?: number; filter?: Record<string, unknown> } = {}
): Promise<QdrantPoint[]> {
    return semanticSearch(text, { ...opts, useCache: true });
}

/**
 * Deletes a vector by ID.
 */
export async function deleteVector(id: string | number): Promise<boolean> {
    try {
        await qdrantClient.delete(COLLECTION_NAME, {
            points: [id],
            wait: true
        });
        return true;
    } catch (err) {
        console.error('deleteVector error:', formatError(err));
        return false;
    }
}

/* -------------------------------------------------------------------------- */
/* High-Level Embedding + Upsert */
/* -------------------------------------------------------------------------- */

/**
 * Embeds text and upserts into Qdrant
 */
export async function embedAndUpsertText(
    id: string,
    text: string,
    payload: Record<string, unknown> = {},
	model: string = EMBEDDING_MODEL
): Promise<number[]> {
    try {
        // produce or fetch embedding
        const embedding = await embedText(text, model);
        if (!Array.isArray(embedding) || embedding.length === 0) {
            return [];
        }

        // ensure collection and upsert into Qdrant
        const ok = await upsertVector(id, embedding, payload);
        if (!ok) {
            console.warn(`embedAndUpsertText: upsertVector failed for id=${id}`);
        }

        return embedding;
    } catch (err) {
        console.error('embedAndUpsertText error:', formatError(err));
        return [];
    }
}







