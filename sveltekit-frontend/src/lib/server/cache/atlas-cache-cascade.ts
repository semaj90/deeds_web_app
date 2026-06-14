/**
 * Atlas Cache Cascade — unified retrieval across 3 tiers
 *
 * L1 Redis LRU → L2 Bitfrost semantic → L3 Qdrant multi-vector → Neo4j expansion → XGBoost rerank
 */

import { getRedisClient } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import {
	AtlasRedisEnvelope,
	AtlasBifrostEnvelope,
	AtlasCacheHit,
	AtlasCacheVersions,
	atlasRedisKey,
	atlasBifrostKey,
	hashQuery,
	hashEmbedding,
} from './atlas-cache-envelope.js';

const REDIS_LRU_TTL = 300; // 5 min
const BITFROST_TTL = 3600; // 1 hour

/**
 * Get current cache versions
 */
export async function getAtlasCacheVersions(): Promise<AtlasCacheVersions> {
	const redis = await getRedisClient();
	const versions = await Promise.all([
		redis.get('atlas:graph_version').then((v) => parseInt(v || '0')),
		redis.get('atlas:qdrant_version').then((v) => parseInt(v || '0')),
		redis.get('atlas:rpc_version').then((v) => parseInt(v || '0')),
		redis.get('atlas:som_version').then((v) => parseInt(v || '0')),
		redis.get('atlas:kmeans_version').then((v) => parseInt(v || '0')),
		redis.get('atlas:cache_epoch').then((v) => parseInt(v || '0')),
	]);

	return {
		graph_version: versions[0],
		qdrant_version: versions[1],
		rpc_version: versions[2],
		som_version: versions[3],
		kmeans_version: versions[4],
		cache_epoch: versions[5],
	};
}

/**
 * L1: Check Redis LRU cache
 */
export async function checkRedisLRU(query: string): Promise<AtlasCacheHit | null> {
	try {
		const redis = await getRedisClient();
		const key = atlasRedisKey('query', hashQuery(query));
		const t0 = Date.now();

		const raw = await redis.get(key);
		if (!raw) return null;

		const envelope = JSON.parse(raw) as AtlasRedisEnvelope;
		return {
			source: 'redis',
			envelope,
			latency_ms: Date.now() - t0,
			graph_version: envelope.graph_version,
			cache_epoch: envelope.cache_epoch,
		};
	} catch {
		return null;
	}
}

/**
 * L2: Check Bitfrost semantic cache
 */
export async function checkBitfrostSemantic(
	query: string,
	embedding: number[]
): Promise<AtlasCacheHit | null> {
	try {
		const redis = await getRedisClient();
		const key = atlasBifrostKey('query', hashEmbedding(embedding));
		const t0 = Date.now();

		const raw = await redis.get(key);
		if (!raw) return null;

		const envelope = JSON.parse(raw) as AtlasBifrostEnvelope;
		return {
			source: 'bitfrost',
			envelope,
			latency_ms: Date.now() - t0,
			graph_version: envelope.graph_version,
			cache_epoch: envelope.cache_epoch,
		};
	} catch {
		return null;
	}
}

/**
 * L3: Query Qdrant multi-vector + payload filters
 */
export async function queryQdrantCascade(
	queryEmbedding: number[],
	filters?: { feature_id?: string; community_id?: string; domain_class?: string },
	limit: number = 20
): Promise<AtlasCacheHit | null> {
	try {
		const t0 = Date.now();

		// Build Qdrant filter
		const mustFilters: Record<string, unknown>[] = [];
		if (filters?.feature_id) {
			mustFilters.push({ key: 'feature_id', match: { value: filters.feature_id } });
		}
		if (filters?.community_id) {
			mustFilters.push({ key: 'community_id', match: { value: filters.community_id } });
		}
		if (filters?.domain_class) {
			mustFilters.push({ key: 'domain_class', match: { value: filters.domain_class } });
		}

		const qdrantFilter = mustFilters.length > 0 ? { must: mustFilters } : undefined;

		// Search Qdrant with named vector 'content'
		const res = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vector: { name: 'content', vector: queryEmbedding },
				limit,
				score_threshold: 0.3,
				filter: qdrantFilter,
				with_payload: true,
			}),
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return null;
		const parsed = (await res.json().catch(() => null)) as { result?: any[] } | null;
		const results = parsed?.result ?? [];

		if (results.length === 0) return null;

		const versions = await getAtlasCacheVersions();

		// Extract packet keys and metadata
		const packet_keys = results.map((r) => r.payload?.packet_key).filter(Boolean);
		const feature_ids = [...new Set(results.map((r) => r.payload?.feature_id).filter(Boolean))];
		const source_refs = [...new Set(results.map((r) => r.payload?.source_ref).filter(Boolean))];

		const envelope: AtlasBifrostEnvelope = {
			embedding_model: 'embeddinggemma',
			embedding_dim: 768,
			query_hash: hashEmbedding(queryEmbedding),
			semantic_neighbors: results.map((_, i) => i),
			packet_keys,
			feature_ids,
			community_ids: [
				...new Set(results.map((r) => r.payload?.community_id).filter(Boolean)),
			],
			som_clusters: results
				.map((r) => r.payload?.som_index)
				.filter((v) => v !== null && v !== undefined),
			kmeans_clusters: results
				.map((r) => r.payload?.kmeans_cluster)
				.filter((v) => v !== null && v !== undefined),
			graph_version: versions.graph_version,
			cache_epoch: versions.cache_epoch,
			latency_ms: Date.now() - t0,
		};

		return {
			source: 'qdrant',
			envelope,
			latency_ms: envelope.latency_ms,
			graph_version: versions.graph_version,
			cache_epoch: versions.cache_epoch,
		};
	} catch {
		return null;
	}
}

/**
 * Write result to Redis LRU cache
 */
export async function writeRedisLRU(
	query: string,
	envelope: AtlasRedisEnvelope,
	ttl: number = REDIS_LRU_TTL
): Promise<boolean> {
	try {
		const redis = await getRedisClient();
		const key = atlasRedisKey('query', hashQuery(query));
		await redis.setex(key, ttl, JSON.stringify(envelope));
		return true;
	} catch {
		return false;
	}
}

/**
 * Invalidate cache at epoch
 */
export async function invalidateAtlasCacheEpoch(): Promise<void> {
	const redis = await getRedisClient();
	const versions = await getAtlasCacheVersions();

	// Increment versions
	await Promise.all([
		redis.incr('atlas:graph_version'),
		redis.incr('atlas:cache_epoch'),
	]);

	// Delete all L1 LRU keys
	const pattern = 'atlas:lru:*';
	const keys = await redis.keys(pattern);
	if (keys.length > 0) {
		await redis.del(...keys);
	}

	// Delete Bitfrost semantic keys
	const bifrostPattern = 'bifrost:sem:*';
	const bifrostKeys = await redis.keys(bifrostPattern);
	if (bifrostKeys.length > 0) {
		await redis.del(...bifrostKeys);
	}

	// Delete ACE packet cache
	const acePattern = 'ace:packet:*';
	const aceKeys = await redis.keys(acePattern);
	if (aceKeys.length > 0) {
		await redis.del(...aceKeys);
	}
}

/**
 * Sync Qdrant payload tags to match current cache epoch
 */
export async function syncQdrantPayloadEpoch(): Promise<{ updated: number; errors: number }> {
	let updated = 0;
	let errors = 0;

	try {
		const versions = await getAtlasCacheVersions();

		// This is a dry-run contract — actual implementation requires
		// Qdrant upsert on payload.cache_epoch and payload.graph_version
		// See: scripts/atlas/sync-qdrant-payload-tags.mjs

		console.log(
			`[atlas-cache-cascade] Qdrant payload sync: current epoch=${versions.cache_epoch}, graph_version=${versions.graph_version}`
		);
	} catch (err) {
		console.error('[atlas-cache-cascade] Payload sync failed:', err);
		errors++;
	}

	return { updated, errors };
}
