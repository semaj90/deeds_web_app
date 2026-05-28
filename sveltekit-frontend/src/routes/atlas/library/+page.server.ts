/**
 * SSR data loader for /atlas/library
 *
 * Fetches the initial card list from Postgres via the API route (reuses cache).
 * Also reads `?card=<id>` to pre-render the selected card for deep-link SSR.
 */

import type { PageServerLoad } from './$types.js';
import type { AtlasCardsResponse, AtlasCardDetail } from '$lib/types/atlas.js';
import { db } from '$lib/server/db/client.js';
import { ragCards, clusterCards } from '$lib/server/db/schema/rag-cards.js';
import { getRedis } from '$lib/server/redis.js';
import { createHash } from 'crypto';
import { desc, asc, eq } from 'drizzle-orm';

const CARD_TTL = 86400;
const LIST_TTL = 3600;
const PAGE_LIMIT = 50;

function vHash(d: unknown) {
	return createHash('sha1').update(JSON.stringify(d)).digest('hex').slice(0, 16);
}

export const load: PageServerLoad = async ({ url }) => {
	const selectedId = url.searchParams.get('card') ?? null;
	const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;
	const redis = getRedis();

	// ── Card list ─────────────────────────────────────────────────────────────
	let cards: AtlasCardsResponse['cards'] = [];
	let versionHash = '';

	try {
		const ptrKey = `atlas:cards:list:ptr:${PAGE_LIMIT}:${offset}`;
		const cachedHash = await redis.get(ptrKey).catch(() => null);

		if (cachedHash) {
			const raw = await redis.get(`atlas:cards:list:${cachedHash}`).catch(() => null);
			if (raw) {
				const parsed: AtlasCardsResponse = JSON.parse(raw);
				cards = parsed.cards;
				versionHash = parsed.versionHash;
			}
		}

		if (!cards.length) {
			const [ragRows, clusterRows] = await Promise.all([
				db
					.select({ id: ragCards.id, filePath: ragCards.filePath, featureLabel: ragCards.featureLabel, summary: ragCards.summary, tags: ragCards.tags, createdAt: ragCards.createdAt })
					.from(ragCards)
					.orderBy(desc(ragCards.createdAt))
					.limit(PAGE_LIMIT)
					.offset(offset),
				db
					.select({ id: clusterCards.id, clusterId: clusterCards.clusterId, centroidLabel: clusterCards.centroidLabel, summary: clusterCards.summary, topTags: clusterCards.topTags, createdAt: clusterCards.createdAt })
					.from(clusterCards)
					.orderBy(asc(clusterCards.clusterId))
					.limit(PAGE_LIMIT)
					.offset(offset)
			]);

			cards = [
				...ragRows.map((r) => ({
					id: r.id, kind: 'rag' as const,
					title: r.filePath.split('/').pop() ?? r.id,
					summary: r.summary,
					featureLabel: r.featureLabel,
					tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
					createdAt: r.createdAt.toISOString()
				})),
				...clusterRows.map((c) => ({
					id: c.id, kind: 'cluster' as const,
					title: c.centroidLabel,
					summary: c.summary,
					featureLabel: `Cluster #${c.clusterId}`,
					tags: Array.isArray(c.topTags) ? (c.topTags as string[]) : [],
					createdAt: c.createdAt.toISOString()
				}))
			];

			versionHash = vHash({ rag: ragRows.length, cluster: clusterRows.length });
			const payload = { ok: true, versionHash, limit: PAGE_LIMIT, offset, count: cards.length, cards };

			await Promise.all([
				redis.set(`atlas:cards:list:${versionHash}`, JSON.stringify(payload), 'EX', LIST_TTL).catch(() => {}),
				redis.set(ptrKey, versionHash, 'EX', LIST_TTL).catch(() => {})
			]);
		}
	} catch (err) {
		console.error('[atlas/library load] card list error:', err);
	}

	// ── Selected card (deep-link SSR) ─────────────────────────────────────────
	let selectedCard: AtlasCardDetail | null = null;

	if (selectedId) {
		try {
			const ptrKey = `atlas:card:ptr:${selectedId}`;
			const cachedHash = await redis.get(ptrKey).catch(() => null);

			if (cachedHash) {
				const raw = await redis.get(`atlas:card:${selectedId}:${cachedHash}`).catch(() => null);
				if (raw) {
					const parsed = JSON.parse(raw);
					selectedCard = parsed.card ?? null;
				}
			}

			if (!selectedCard) {
				// Try rag_cards then cluster_cards
				const ragRow = await db.select().from(ragCards).where(eq(ragCards.id, selectedId)).limit(1).then(r => r[0] ?? null);
				if (ragRow) {
					selectedCard = { id: ragRow.id, kind: 'rag', filePath: ragRow.filePath, featureLabel: ragRow.featureLabel, summary: ragRow.summary, tags: ragRow.tags as string[], createdAt: ragRow.createdAt.toISOString() };
				} else {
					const clRow = await db.select().from(clusterCards).where(eq(clusterCards.id, selectedId)).limit(1).then(r => r[0] ?? null);
					if (clRow) {
						selectedCard = { id: clRow.id, kind: 'cluster', clusterId: clRow.clusterId, centroidLabel: clRow.centroidLabel, summary: clRow.summary, topTags: clRow.topTags as string[], topFiles: clRow.topFiles as unknown[], featureLabel: `Cluster #${clRow.clusterId}`, createdAt: clRow.createdAt.toISOString() };
					}
				}

				if (selectedCard) {
					const hash = vHash(selectedCard);
					const payload = { ok: true, versionHash: hash, card: selectedCard, similarCards: [] };
					await Promise.all([
						redis.set(`atlas:card:${selectedId}:${hash}`, JSON.stringify(payload), 'EX', CARD_TTL).catch(() => {}),
						redis.set(ptrKey, hash, 'EX', CARD_TTL).catch(() => {})
					]);
				}
			}
		} catch (err) {
			console.error('[atlas/library load] selectedCard error:', err);
		}
	}

	return {
		cards,
		versionHash,
		selectedCard,
		selectedId,
		offset,
		limit: PAGE_LIMIT
	};
};
