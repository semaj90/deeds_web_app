/**
 * /api/atlas/cards
 *
 * List rag_cards + cluster_cards from Postgres.
 * Cached in Redis under atlas:cards:list:<versionHash> (1 hour TTL).
 * Supports ETag / If-None-Match for browser-level cache revalidation.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/client.js';
import { ragCards, clusterCards } from '$lib/server/db/schema/rag-cards.js';
import { getRedis } from '$lib/server/redis.js';
import { createHash } from 'crypto';
import { asc, desc } from 'drizzle-orm';

const LIST_TTL_SECONDS = 3600; // 1 hour
const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AtlasCardSummary {
	id: string;
	kind: 'rag' | 'cluster';
	title: string;
	summary: string;
	featureLabel: string;
	tags: string[];
	createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function hashPayload(payload: unknown): string {
	return createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

function buildVersionHash(rag: unknown[], cluster: unknown[]): string {
	return hashPayload({ rag: rag.length, cluster: cluster.length });
}

async function fetchFromDb(
	limit: number,
	offset: number
): Promise<{ cards: AtlasCardSummary[]; versionHash: string }> {
	const [ragRows, clusterRows] = await Promise.all([
		db
			.select({
				id: ragCards.id,
				filePath: ragCards.filePath,
				featureLabel: ragCards.featureLabel,
				summary: ragCards.summary,
				tags: ragCards.tags,
				createdAt: ragCards.createdAt
			})
			.from(ragCards)
			.orderBy(desc(ragCards.createdAt))
			.limit(limit)
			.offset(offset),
		db
			.select({
				id: clusterCards.id,
				clusterId: clusterCards.clusterId,
				centroidLabel: clusterCards.centroidLabel,
				summary: clusterCards.summary,
				topTags: clusterCards.topTags,
				createdAt: clusterCards.createdAt
			})
			.from(clusterCards)
			.orderBy(asc(clusterCards.clusterId))
			.limit(limit)
			.offset(offset)
	]);

	const cards: AtlasCardSummary[] = [
		...ragRows.map((r) => ({
			id: r.id,
			kind: 'rag' as const,
			title: r.filePath.split('/').pop() ?? r.id,
			summary: r.summary,
			featureLabel: r.featureLabel,
			tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
			createdAt: r.createdAt.toISOString()
		})),
		...clusterRows.map((c) => ({
			id: c.id,
			kind: 'cluster' as const,
			title: c.centroidLabel,
			summary: c.summary,
			featureLabel: `Cluster #${c.clusterId}`,
			tags: Array.isArray(c.topTags) ? (c.topTags as string[]) : [],
			createdAt: c.createdAt.toISOString()
		}))
	];

	const versionHash = buildVersionHash(ragRows, clusterRows);
	return { cards, versionHash };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export const GET: RequestHandler = async ({ url, request, locals}) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const limitParam = parseInt(url.searchParams.get('limit') ?? String(PAGE_SIZE_DEFAULT), 10);
	const limit = Number.isFinite(limitParam)
		? Math.min(Math.max(limitParam, 1), PAGE_SIZE_MAX)
		: PAGE_SIZE_DEFAULT;
	const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;

	const redis = getRedis();
	const cacheKeyPrefix = `atlas:cards:list`;

	try {
		// Try Redis cache (we don't know versionHash yet, so check a pointer key)
		const pointerKey = `${cacheKeyPrefix}:ptr:${limit}:${offset}`;
		const cachedHash = await redis.get(pointerKey).catch(() => null);

		if (cachedHash) {
			const cachedData = await redis
				.get(`${cacheKeyPrefix}:${cachedHash}`)
				.catch(() => null);
			if (cachedData) {
				const parsed = JSON.parse(cachedData);
				const etag = `"${cachedHash}"`;
				const clientEtag = request.headers.get('if-none-match');
				if (clientEtag === etag) {
					return new Response(null, { status: 304, headers: { ETag: etag } });
				}
				return json(parsed, {
					headers: {
						ETag: etag,
						'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600'
					}
				});
			}
		}

		// Cache miss — fetch from Postgres
		const { cards, versionHash } = await fetchFromDb(limit, offset);
		const responsePayload = { ok: true, versionHash, limit, offset, count: cards.length, cards };
		const etag = `"${versionHash}"`;

		// Write to Redis
		await Promise.all([
			redis
				.set(`${cacheKeyPrefix}:${versionHash}`, JSON.stringify(responsePayload), 'EX', LIST_TTL_SECONDS)
				.catch(() => {}),
			redis.set(pointerKey, versionHash, 'EX', LIST_TTL_SECONDS).catch(() => {})
		]);

		return json(responsePayload, {
			headers: {
				ETag: etag,
				'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600'
			}
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('[atlas/cards] Error:', msg);
		return json({ ok: false, error: msg, cards: [] }, { status: 500 });
	}
};
