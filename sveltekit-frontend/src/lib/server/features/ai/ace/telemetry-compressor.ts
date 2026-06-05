import { pool } from '$lib/server/db/client.js';
import { getRedis } from '$lib/server/redis.js';

interface RawTelemetryData {
	route: string;
	query_hash: string;
	query_preview: string;
	source_refs: string[];
	feature_ids: string[];
	lane_ids: string[];
	cluster_id?: string;
	som_cluster?: string;
	qdrant_hits?: number;
	redis_hot_keys?: string[];
	userId?: number | null;
	sessionId?: string | null;
	latencyMs?: number | null;
}

export interface DecompressedTelemetry {
	sourceRefs: string[];
	featureIds: string[];
	laneIds: string[];
	qdrantHits: number;
	somCluster: string | null;
	redisHotKeysCount: number;
	timestamp: string;
}

/**
 * Compresses raw runtime telemetry data into integer-coded NES-style packets
 * and stores it to Redis under `ace:telemetry:{packetId}:lod0`.
 */
export async function compressAndStoreTelemetry(
	packetId: number,
	data: RawTelemetryData
): Promise<void> {
	try {
		const redis = getRedis();

		// 1. Fetch feature and tag encode tables from Redis
		const [featEncodeRaw, tagEncodeRaw] = await Promise.all([
			redis.get('ace:dict:feature_encode'),
			redis.get('ace:dict:tag_encode')
		]);
		const featEncode = featEncodeRaw ? JSON.parse(featEncodeRaw) : {};
		const tagEncode = tagEncodeRaw ? JSON.parse(tagEncodeRaw) : {};
		const laneEncode: Record<string, number> = {
			source: 1,
			dependency: 2,
			config: 3,
			test: 4,
			generated: 5,
			doc: 6
		};

		// 2. Query Postgres for source_ref_id for all source_refs
		let sourceRefIds: number[] = [];
		if (data.source_refs && data.source_refs.length > 0) {
			const res = await pool.query(
				'SELECT DISTINCT source_ref, source_ref_id FROM parent_atlas_documents WHERE source_ref = ANY($1)',
				[data.source_refs]
			);
			sourceRefIds = res.rows.map((r: any) => r.source_ref_id).filter(Boolean);
		}

		// 3. Map feature_ids to codes
		const featureCodes = (data.feature_ids || [])
			.map((f) => featEncode[f])
			.filter((c): c is number => c != null);

		// 4. Map lane_ids to codes
		const laneCodes = (data.lane_ids || [])
			.map((l) => laneEncode[l])
			.filter((c): c is number => c != null);

		// 5. Parse SOM cluster or cluster_id to integer
		let somClusterInt = 0;
		const somClusterStr = data.som_cluster || data.cluster_id || '';
		if (somClusterStr) {
			const match = somClusterStr.match(/\b\d+\b/);
			if (match) {
				somClusterInt = parseInt(match[0], 10);
			}
		}

		// 6. Build the compact telemetry packet
		const packet = {
			s: sourceRefIds, // source integer IDs
			f: featureCodes, // feature codes
			l: laneCodes, // lane codes
			q: data.qdrant_hits || 0, // qdrant hits count
			c: somClusterInt, // SOM cluster ID (integer)
			k: data.redis_hot_keys?.length || 0, // count of redis hot keys
			t: new Date().toISOString() // timestamp
		};

		// 7. Store to Redis (24h TTL)
		const key = `ace:telemetry:${packetId}:lod0`;
		await redis.set(key, JSON.stringify(packet), 'EX', 86400);
	} catch (err) {
		console.warn(`[Telemetry Compression Failed for ID ${packetId}]:`, err);
	}
}

/**
 * Decompresses integer-coded telemetry packet from Redis.
 */
export async function decompressTelemetry(
	packetId: number
): Promise<DecompressedTelemetry | null> {
	try {
		const redis = getRedis();
		const key = `ace:telemetry:${packetId}:lod0`;
		const raw = await redis.get(key);
		if (!raw) return null;

		const packet = JSON.parse(raw);

		// Fetch decode tables from Redis
		const [decodeSourcesRaw, decodeFeaturesRaw, decodeLanesRaw] = await Promise.all([
			redis.get('ace:dict:sources'),
			redis.get('ace:dict:features'),
			redis.get('ace:dict:lanes')
		]);

		const decodeSources = decodeSourcesRaw ? JSON.parse(decodeSourcesRaw) : {};
		const decodeFeatures = decodeFeaturesRaw ? JSON.parse(decodeFeaturesRaw) : {};
		const decodeLanes = decodeLanesRaw ? JSON.parse(decodeLanesRaw) : {};

		// Map integer codes back to strings
		const sourceRefs = (packet.s || [])
			.map((id: number) => decodeSources[String(id)])
			.filter((s: string): s is string => !!s);

		const featureIds = (packet.f || [])
			.map((code: number) => decodeFeatures[String(code)])
			.filter((f: string): f is string => !!f);

		const laneIds = (packet.l || [])
			.map((code: number) => decodeLanes[String(code)])
			.filter((l: string): l is string => !!l);

		return {
			sourceRefs,
			featureIds,
			laneIds,
			qdrantHits: packet.q ?? 0,
			somCluster: packet.c ? `cluster:${packet.c}` : null,
			redisHotKeysCount: packet.k ?? 0,
			timestamp: packet.t || new Date().toISOString()
		};
	} catch (err) {
		console.warn(`[Telemetry Decompression Failed for ID ${packetId}]:`, err);
		return null;
	}
}
