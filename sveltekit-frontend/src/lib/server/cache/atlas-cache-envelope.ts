/**
 * Atlas Cache Envelope — Unified 3-tier cache contract
 *
 * L1: Redis/Valkey LRU (exact packet/query/tool cache, 5min TTL)
 * L2: Bifrost semantic cache (query_hash/embedding_hash/source_ref, configurable TTL)
 * L3: Qdrant multi-vector + payload tags (dense semantic + topology filters)
 *
 * Single source of truth for versioning: atlas:graph_version, atlas:qdrant_version, etc.
 * Invalidation tied to cache epoch on graph truth promotion.
 */

import { z } from 'zod';

// L1 Redis LRU result envelope
export const AtlasRedisEnvelopeSchema = z.object({
	query: z.string(),
	packet_keys: z.array(z.string()),
	feature_ids: z.array(z.string()),
	source_refs: z.array(z.string()),
	qdrant_point_ids: z.array(z.union([z.number(), z.string()])).optional(),
	redis_hit: z.boolean(),
	bitfrost_hit: z.boolean(),
	qdrant_hit: z.boolean(),
	graph_version: z.number(),
	cache_epoch: z.number(),
	ttl_seconds: z.number().default(300),
	latency_ms: z.number().optional(),
});

export type AtlasRedisEnvelope = z.infer<typeof AtlasRedisEnvelopeSchema>;

// L2 Bitfrost semantic envelope
export const AtlasBifrostEnvelopeSchema = z.object({
	embedding_model: z.literal('embeddinggemma').or(z.literal('nomic-embed-text')),
	embedding_dim: z.number().default(768),
	query_hash: z.string(),
	semantic_neighbors: z.array(z.number()),
	packet_keys: z.array(z.string()),
	feature_ids: z.array(z.string()),
	community_ids: z.array(z.string()),
	som_clusters: z.array(z.number()).optional(),
	kmeans_clusters: z.array(z.number()).optional(),
	ace_kag_dag_hit: z.record(z.string(), z.unknown()).optional(),
	graph_version: z.number(),
	cache_epoch: z.number(),
	latency_ms: z.number().optional(),
});

export type AtlasBifrostEnvelope = z.infer<typeof AtlasBifrostEnvelopeSchema>;

// L3 Qdrant payload schema
export const AtlasQdrantPayloadSchema = z.object({
	packet_key: z.string(),
	source_ref: z.string(),
	feature_id: z.string(),
	feature_label: z.string(),
	domain_class: z.string(),
	community_id: z.string(),
	concept_ids: z.array(z.string()).optional(),
	som_row: z.number().nullable().optional(),
	som_col: z.number().nullable().optional(),
	som_index: z.number().nullable().optional(),
	kmeans_cluster: z.number().nullable().optional(),
	surface: z.enum(['code', 'doc', 'rpc', 'trace', 'tool']),
	graph_version: z.number(),
	cache_epoch: z.number(),
	qdrant_tags: z.array(z.string()).optional(),
});

export type AtlasQdrantPayload = z.infer<typeof AtlasQdrantPayloadSchema>;

// L3 Qdrant vector envelope
export const AtlasQdrantVectorSchema = z.object({
	content: z.array(z.number()).length(768).optional(),
	signature: z.array(z.number()).length(768).optional(),
	latent_64: z.array(z.number()).length(64).optional(),
});

export type AtlasQdrantVector = z.infer<typeof AtlasQdrantVectorSchema>;

/**
 * Cache hit result — unified across all 3 tiers
 */
export interface AtlasCacheHit {
	source: 'redis' | 'bitfrost' | 'qdrant' | 'none';
	envelope: AtlasRedisEnvelope | AtlasBifrostEnvelope | null;
	latency_ms: number;
	graph_version: number;
	cache_epoch: number;
}

/**
 * Versioning contract — single source of truth
 */
export interface AtlasCacheVersions {
	graph_version: number;
	qdrant_version: number;
	rpc_version: number;
	som_version: number;
	kmeans_version: number;
	cache_epoch: number;
}

/**
 * Helper: generate Redis LRU key
 */
export function atlasRedisKey(type: 'query' | 'packet' | 'tools' | 'kag', hash: string): string {
	return `atlas:lru:${type}:${hash}`;
}

/**
 * Helper: generate Bitfrost key
 */
export function atlasBifrostKey(
	type: 'query' | 'packet' | 'feature' | 'intent',
	hash: string
): string {
	return `bifrost:sem:${type}:${hash}`;
}

/**
 * Helper: hash query for cache key
 */
export function hashQuery(query: string): string {
	const encoder = new TextEncoder();
	const data = encoder.encode(query);
	let hash = 0;
	for (let i = 0; i < data.length; i++) {
		hash = (hash << 5) - hash + data[i];
		hash = hash & hash; // 32-bit integer
	}
	return Math.abs(hash).toString(16);
}

/**
 * Helper: hash embedding vector
 */
export function hashEmbedding(embedding: number[]): string {
	const truncated = embedding.slice(0, 10).map((v) => Math.round(v * 1000));
	return truncated.join('-');
}
