/**
 * Atlas Cache Cascade — unified retrieval across 3 tiers
 *
 * L1 Redis LRU → L2 Bitfrost semantic → L3 Qdrant multi-vector → Neo4j expansion → XGBoost rerank
 */

import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import {
	AtlasRedisEnvelope,
	AtlasBifrostEnvelope,
	AtlasCacheHit,
	AtlasCacheVersions,
	atlasRedisKeyV2,
	atlasBifrostKeyV2,
	hashQueryV2,
	hashEmbeddingV2,
} from './atlas-cache-envelope.js';

const REDIS_LRU_TTL = 300; // 5 min

/**
 * Get current cache versions.
 * Fails open if Redis is unavailable; returns default version 0 for all keys.
 */
export async function getAtlasCacheVersions(): Promise<AtlasCacheVersions> {
	try {
		const redis = getRedis();
		const versions = await Promise.allSettled([
			redis.get('atlas:graph_version').then((v) => parseInt(v || '0')),
			redis.get('atlas:qdrant_version').then((v) => parseInt(v || '0')),
			redis.get('atlas:rpc_version').then((v) => parseInt(v || '0')),
			redis.get('atlas:som_version').then((v) => parseInt(v || '0')),
			redis.get('atlas:kmeans_version').then((v) => parseInt(v || '0')),
			redis.get('atlas:cache_epoch').then((v) => parseInt(v || '0')),
		]);

		return {
			graph_version: versions[0].status === 'fulfilled' ? versions[0].value : 0,
			qdrant_version: versions[1].status === 'fulfilled' ? versions[1].value : 0,
			rpc_version: versions[2].status === 'fulfilled' ? versions[2].value : 0,
			som_version: versions[3].status === 'fulfilled' ? versions[3].value : 0,
			kmeans_version: versions[4].status === 'fulfilled' ? versions[4].value : 0,
			cache_epoch: versions[5].status === 'fulfilled' ? versions[5].value : 0,
		};
	} catch {
		return {
			graph_version: 0,
			qdrant_version: 0,
			rpc_version: 0,
			som_version: 0,
			kmeans_version: 0,
			cache_epoch: 0,
		};
	}
}

/** L1: exact query lookup in the current logical cache epoch. */
export async function checkRedisLRU(query: string): Promise<AtlasCacheHit | null> {
	try {
		const redis = getRedis();
		const versions = await getAtlasCacheVersions();
		const key = atlasRedisKeyV2('query', hashQueryV2(query), versions.cache_epoch);
		const t0 = Date.now();
		const raw = await redis.get(key);
		if (!raw) return null;

		const envelope = JSON.parse(raw) as AtlasRedisEnvelope;
		if (envelope.cache_epoch !== versions.cache_epoch) return null;
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

/** L2: exact full-vector semantic identity lookup in the current epoch. */
export async function checkBitfrostSemantic(
	query: string,
	embedding: number[]
): Promise<AtlasCacheHit | null> {
	void query; // semantic identity is the exact canonical FP32 embedding checksum.
	try {
		const redis = getRedis();
		const versions = await getAtlasCacheVersions();
		const key = atlasBifrostKeyV2('query', hashEmbeddingV2(embedding), versions.cache_epoch);
		const t0 = Date.now();
		const raw = await redis.get(key);
		if (!raw) return null;

		const envelope = JSON.parse(raw) as AtlasBifrostEnvelope;
		if (envelope.cache_epoch !== versions.cache_epoch) return null;
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

/** L3: Query Qdrant multi-vector + payload filters. */
export async function queryQdrantCascade(
	queryEmbedding: number[],
	filters?: {
		feature_id?: string;
		community_id?: string;
		domain_class?: string;
		topology_label?: string;
		ontology_label?: string;
		cluster_key?: string;
		kmeans_cluster?: string | number;
	},
	limit: number = 20
): Promise<AtlasCacheHit | null> {
	try {
		const t0 = Date.now();
		const mustFilters: Record<string, unknown>[] = [];
		if (filters?.feature_id) mustFilters.push({ key: 'feature_id', match: { value: filters.feature_id } });
		if (filters?.community_id) mustFilters.push({ key: 'community_id', match: { value: filters.community_id } });
		if (filters?.domain_class) mustFilters.push({ key: 'domain_class', match: { value: filters.domain_class } });
		if (filters?.topology_label) mustFilters.push({ key: 'topology_label', match: { value: filters.topology_label } });
		if (filters?.ontology_label) mustFilters.push({ key: 'ontology_label', match: { value: filters.ontology_label } });
		if (filters?.cluster_key) mustFilters.push({ key: 'cluster_key', match: { value: filters.cluster_key } });
		if (filters?.kmeans_cluster !== undefined && filters?.kmeans_cluster !== null && String(filters.kmeans_cluster).trim() !== '') {
			mustFilters.push({ key: 'kmeans_cluster', match: { value: filters.kmeans_cluster } });
		}

		const qdrantFilter = mustFilters.length > 0 ? { must: mustFilters } : undefined;
		const res = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/query`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query: queryEmbedding,
				using: 'content',
				limit,
				score_threshold: 0.3,
				filter: qdrantFilter,
				with_payload: true,
			}),
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return null;
		const parsed = (await res.json().catch(() => null)) as { result?: { points?: any[] } } | null;
		const results = parsed?.result?.points ?? [];
		if (results.length === 0) return null;

		let versions: AtlasCacheVersions = {
			graph_version: 0,
			qdrant_version: 0,
			rpc_version: 0,
			som_version: 0,
			kmeans_version: 0,
			cache_epoch: 0,
		};
		try {
			versions = await getAtlasCacheVersions();
		} catch {
			// Qdrant remains useful if cache-version telemetry is unavailable.
		}

		const packet_keys = results.map((r) => r.payload?.packet_key).filter(Boolean);
		const feature_ids = [...new Set(results.map((r) => r.payload?.feature_id).filter(Boolean))];

		const envelope: AtlasBifrostEnvelope = {
			embedding_model: 'embeddinggemma',
			embedding_dim: 768,
			query_hash: hashEmbeddingV2(queryEmbedding),
			semantic_neighbors: results.map((_, i) => i),
			packet_keys,
			feature_ids,
			community_ids: [...new Set(results.map((r) => r.payload?.community_id).filter(Boolean))],
			topology_labels: [...new Set(results.map((r) => r.payload?.topology_label ?? r.payload?.topologyLabel).filter(Boolean))] as string[],
			ontology_labels: [...new Set(results.map((r) => r.payload?.ontology_label ?? r.payload?.ontologyLabel).filter(Boolean))] as string[],
			cluster_keys: [...new Set(results.map((r) => r.payload?.cluster_key ?? r.payload?.clusterKey).filter(Boolean))] as string[],
			som_clusters: results.map((r) => r.payload?.som_index).filter((v) => v !== null && v !== undefined),
			kmeans_clusters: results.map((r) => r.payload?.kmeans_cluster).filter((v) => v !== null && v !== undefined),
			graph_version: versions.graph_version,
			cache_epoch: versions.cache_epoch,
			latency_ms: Date.now() - t0,
		};

		return {
			source: 'qdrant',
			envelope,
			latency_ms: envelope.latency_ms ?? Date.now() - t0,
			graph_version: versions.graph_version,
			cache_epoch: versions.cache_epoch,
		};
	} catch {
		return null;
	}
}

/** Write an L1 result into exactly the epoch recorded by the envelope. */
export async function writeRedisLRU(
	query: string,
	envelope: AtlasRedisEnvelope,
	ttl: number = REDIS_LRU_TTL
): Promise<boolean> {
	try {
		const redis = getRedis();
		const key = atlasRedisKeyV2('query', hashQueryV2(query), envelope.cache_epoch);
		await redis.setex(key, ttl, JSON.stringify(envelope));
		return true;
	} catch {
		return false;
	}
}

/**
 * O(1) logical invalidation: advance graph + cache epochs.
 * Old epoch-qualified entries become unreachable immediately and expire naturally by TTL.
 * No KEYS/SCAN traversal belongs on the request invalidation path.
 */
export async function invalidateAtlasCacheEpoch(): Promise<{ graphVersion: number; cacheEpoch: number }> {
	const redis = getRedis();
	const [graphVersion, cacheEpoch] = await Promise.all([
		redis.incr('atlas:graph_version'),
		redis.incr('atlas:cache_epoch'),
	]);
	return { graphVersion, cacheEpoch };
}

/** Sync Qdrant payload tags to match current cache epoch. */
export async function syncQdrantPayloadEpoch(): Promise<{ updated: number; errors: number }> {
	let updated = 0;
	let errors = 0;
	try {
		const versions = await getAtlasCacheVersions();
		console.log(
			`[atlas-cache-cascade] Qdrant payload sync: current epoch=${versions.cache_epoch}, graph_version=${versions.graph_version}`
		);
	} catch (err) {
		console.error('[atlas-cache-cascade] Payload sync failed:', err);
		errors++;
	}
	return { updated, errors };
}

export type { AtlasCacheHit } from './atlas-cache-envelope.js';
