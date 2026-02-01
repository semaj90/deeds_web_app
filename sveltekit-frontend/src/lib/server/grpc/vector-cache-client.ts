import { env } from '$env/dynamic/private';
import { VectorCacheServiceClient } from '$lib/proto/vector_cache_grpc_pb';
import { EmbedLookupRequest, EmbedStoreRequest } from '$lib/proto/vector_cache_pb';
import type { ServiceError } from '@grpc/grpc-js';
import { credentials } from '@grpc/grpc-js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// For GRPC_VECTORCACHE_URL
const GRPC_VECTORCACHE_URL = env?.GRPC_VECTORCACHE_URL ?? "localhost:50051";

// @ts-ignore
const client = new VectorCacheServiceClient(GRPC_VECTORCACHE_URL, credentials.createInsecure());

/**
 * Looks up a semantic cache entry using an embedding via gRPC.
 * @param embedding The Float32Array embedding of the query.
 * @returns The cached JSON response if found, else null.
 */
export async function lookupSemanticCache(embedding: Float32Array): Promise<unknown | null> {
    return new Promise((resolve, reject) => {
        const req = new EmbedLookupRequest();
        req.setEmbeddingList(Array.from(embedding));

        client.lookup(req, (err: ServiceError | null, res: any) => {
            if (err) {
                console.error("gRPC Lookup error: ", err);
                return reject(err);
            }
            if (!res.getHit()) {
                return resolve(null);
            }
            try {
                const entry = res.getEntry();
                if (entry) {
                    return resolve(JSON.parse(entry.getValueJson()));
                }
                return resolve(null);
            } catch (parseError) {
                console.error("Failed to parse cached JSON from gRPC response: ", parseError);
                return reject(parseError);
            }
        });
    });
}

/**
 * Stores a semantic cache entry using an embedding and a JSON value via gRPC.
 * @param embedding The Float32Array embedding of the query.
 * @param value The JSON object to store.
 * @param ttlSeconds Time-to-live for the cache entry in seconds.
 * @returns The key used for storage if successful, else null.
 */
export async function storeSemanticCache(embedding: Float32Array, value: any, ttlSeconds: number): Promise<string | null> {
    return new Promise((resolve, reject) => {
        const req = new EmbedStoreRequest();
        req.setEmbeddingList(Array.from(embedding));
        req.setValueJson(JSON.stringify(value));
        req.setTtlSeconds(ttlSeconds);

        client.store(req, (err: ServiceError | null, res: any) => {
            if (err) {
                console.error("gRPC Store error: ", err);
                return reject(err);
            }
            if (res.getSuccess()) {
                return resolve(res.getKey());
            }
            return resolve(null);
        });
    });
}
