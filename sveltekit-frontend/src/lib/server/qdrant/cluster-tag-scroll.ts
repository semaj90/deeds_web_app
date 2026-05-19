import { ENV } from '$lib/server/env.server.js';
import { getRedis } from '$lib/server/redis.js';

export interface TagHistogram {
	clusterId: number;
	tagFreq: Record<string, number>;
	totalPoints: number;
	cachedAt: string;
}

const CACHE_TTL = 600;
const COLLECTION = 'codebase_chunks_768';

export async function scrollClusterTags(clusterId: number, limit = 500): Promise<TagHistogram> {
	const cacheKey = `qdrant:cluster:tags:hist:${clusterId}`;
	const redis = getRedis();

	const cached = await redis.get(cacheKey).catch(() => null);
	if (cached) return JSON.parse(cached) as TagHistogram;

	const tagFreq: Record<string, number> = {};
	let offset: string | number | null = null;
	let totalPoints = 0;
	const qdrantUrl = ENV.QDRANT_URL;

	do {
		const body: Record<string, unknown> = {
			filter: { must: [{ key: 'neo4j_gpuCluster', match: { value: clusterId } }] },
			with_payload: ['tags'],
			with_vector: false,
			limit,
		};
		if (offset !== null) body.offset = offset;

		const res = await fetch(`${qdrantUrl}/collections/${COLLECTION}/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		const data = (await res.json()) as {
			result: {
				points: Array<{ payload?: { tags?: string[] } }>;
				next_page_offset: string | number | null;
			};
		};

		for (const pt of data.result.points) {
			totalPoints++;
			for (const tag of pt.payload?.tags ?? []) {
				tagFreq[tag] = (tagFreq[tag] ?? 0) + 1;
			}
		}
		offset = data.result.next_page_offset ?? null;
	} while (offset !== null);

	const result: TagHistogram = {
		clusterId,
		tagFreq,
		totalPoints,
		cachedAt: new Date().toISOString(),
	};
	await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result)).catch(() => {});
	return result;
}
