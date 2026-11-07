/**
 * valkey-packet-cache.ts
 *
 * Server-Side Valkey/Redis Packet Cache Bridge.
 * Replaces high-overhead client-side LokiJS serialization with zero-overhead
 * binary/JSON keyframe caching in Valkey (127.0.0.1:6379).
 *
 * Cache pattern:
 * - TTL: 3600 seconds (1 hour transient session window)
 * - Keys: `valkey:spatial:packet:{caseId}:{sceneId}:{revisionId}`
 * - Direct ingestion into SvelteKit 2 server routes and N64 16 KB arena.
 */

import { getValkeyClient } from './valkey-client.js';

export interface CachedSpatialPacket {
	caseId: string;
	sceneId: string;
	titleId: string;
	sourceSha256: string;
	revisionId: number;
	activeSlotBitset: string;
	packedTransformsBase64: string;
	clusterMetadata: Record<string, unknown>;
	cachedAt: string;
}

const SPATIAL_KEY_PREFIX = 'valkey:spatial:packet:';
const DEFAULT_TTL_SECONDS = 3600;

export async function setCachedSpatialPacket(
	caseId: string,
	sceneId: string,
	revisionId: number,
	packet: CachedSpatialPacket,
	ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<boolean> {
	if (packet.caseId !== caseId || packet.sceneId !== sceneId || packet.revisionId !== revisionId) {
		return false;
	}
	try {
		const client = getValkeyClient();
		const key = `${SPATIAL_KEY_PREFIX}${caseId}:${sceneId}:${revisionId}`;
		await client.set(key, JSON.stringify(packet), 'EX', ttlSeconds);
		return true;
	} catch (err) {
		console.warn(`[ValkeyPacketCache] Failed to cache packet ${sceneId}:${revisionId}`, err);
		return false;
	}
}

export async function getCachedSpatialPacket(
	caseId: string,
	sceneId: string,
	revisionId: number
): Promise<CachedSpatialPacket | null> {
	try {
		const client = getValkeyClient();
		const key = `${SPATIAL_KEY_PREFIX}${caseId}:${sceneId}:${revisionId}`;
		const raw = await client.get(key);
		if (!raw) return null;
		return JSON.parse(raw) as CachedSpatialPacket;
	} catch (err) {
		console.warn(`[ValkeyPacketCache] Failed to retrieve packet ${sceneId}:${revisionId}`, err);
		return null;
	}
}

export async function invalidateCachedSpatialPacket(
	caseId: string,
	sceneId: string,
	revisionId?: number
): Promise<void> {
	try {
		const client = getValkeyClient();
		if (revisionId !== undefined) {
			await client.del(`${SPATIAL_KEY_PREFIX}${caseId}:${sceneId}:${revisionId}`);
		} else {
			// Invalidate all revisions of sceneId
			const keys = await client.keys(`${SPATIAL_KEY_PREFIX}${caseId}:${sceneId}:*`);
			if (keys.length > 0) {
				await client.del(...keys);
			}
		}
	} catch (err) {
		console.warn(`[ValkeyPacketCache] Failed to invalidate packet ${sceneId}`, err);
	}
}
