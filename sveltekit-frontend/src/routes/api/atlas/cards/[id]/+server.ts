/**
 * /api/atlas/cards/[id]
 *
 * Fetch a single card by ID (rag_card or cluster_card).
 * Cached in Redis under atlas:card:<id>:<versionHash> (24 hour TTL).
 * Also queries Qdrant for "find similar cards" (top 5).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/client.js';
import { ragCards, ragEmbeddings, clusterCards } from '$lib/server/db/schema/rag-cards.js';
import { getRedis } from '$lib/server/redis.js';
import qdrantClient from '$lib/server/services/qdrant-client.js';
import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';

const CARD_TTL_SECONDS = 86400; // 24 hours
const QDRANT_COLLECTION = 'external_programming_docs_768';

// ── Helpers ───────────────────────────────────────────────────────────────────
function versionHash(data: unknown): string {
	return createHash('sha1').update(JSON.stringify(data)).digest('hex').slice(0, 16);
}

// ── Handler ───────────────────────────────────────────────────────────────────
export const GET: RequestHandler = async ({ params, request, locals}) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const { id } = params;
	if (!id) return json({ ok: false, error: 'Missing id' }, { status: 400 });

	const redis = getRedis();
	const ptrKey = `atlas:card:ptr:${id}`;

	try {
		// ── Redis cache check ─────────────────────────────────────────────────
		const cachedHash = await redis.get(ptrKey).catch(() => null);
		if (cachedHash) {
			const raw = await redis.get(`atlas:card:${id}:${cachedHash}`).catch(() => null);
			if (raw) {
				const parsed = JSON.parse(raw);
				const etag = `"${cachedHash}"`;
				if (request.headers.get('if-none-match') === etag) {
					return new Response(null, { status: 304, headers: { ETag: etag } });
				}
				return json(parsed, {
					headers: { ETag: etag, 'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400' }
				});
			}
		}

		// ── Postgres lookup ───────────────────────────────────────────────────
		// Try rag_cards first, then cluster_cards
		let card: Record<string, unknown> | null = null;
		let kind: 'rag' | 'cluster' = 'rag';

		const ragRow = await db
			.select()
			.from(ragCards)
			.where(eq(ragCards.id, id))
			.limit(1)
			.then((r) => r[0] ?? null);

		if (ragRow) {
			card = {
				id: ragRow.id,
				kind: 'rag',
				filePath: ragRow.filePath,
				featureLabel: ragRow.featureLabel,
				summary: ragRow.summary,
				tags: ragRow.tags,
				createdAt: ragRow.createdAt
			};
			kind = 'rag';
		} else {
			const clusterRow = await db
				.select()
				.from(clusterCards)
				.where(eq(clusterCards.id, id))
				.limit(1)
				.then((r) => r[0] ?? null);

			if (clusterRow) {
				card = {
					id: clusterRow.id,
					kind: 'cluster',
					clusterId: clusterRow.clusterId,
					centroidLabel: clusterRow.centroidLabel,
					topTags: clusterRow.topTags,
					topFiles: clusterRow.topFiles,
					summary: clusterRow.summary,
					createdAt: clusterRow.createdAt
				};
				kind = 'cluster';
			}
		}

		if (!card) {
			return json({ ok: false, error: `Card not found: ${id}` }, { status: 404 });
		}

		// ── Qdrant similarity search ──────────────────────────────────────────
		let similarCards: unknown[] = [];
		try {
			// For rag cards, grab their stored embedding from rag_embeddings
			if (kind === 'rag') {
				const embRow = await db
					.select({ embedding: ragEmbeddings.embedding })
					.from(ragEmbeddings)
					.where(eq(ragEmbeddings.cardId, id))
					.limit(1)
					.then((r) => r[0] ?? null);

				if (embRow?.embedding && Array.isArray(embRow.embedding)) {
					similarCards = await qdrantClient.search({
						collectionName: QDRANT_COLLECTION,
						vector: embRow.embedding as number[],
						limit: 5
					});
				}
			}
		} catch (qdrantErr) {
			// non-fatal — Qdrant similarity is optional
			console.warn('[atlas/cards/[id]] Qdrant similarity failed:', qdrantErr);
		}

		// ── Build + cache response ────────────────────────────────────────────
		const hash = versionHash(card);
		const payload = { ok: true, versionHash: hash, card, similarCards };

		await Promise.all([
			redis
				.set(`atlas:card:${id}:${hash}`, JSON.stringify(payload), 'EX', CARD_TTL_SECONDS)
				.catch(() => {}),
			redis.set(ptrKey, hash, 'EX', CARD_TTL_SECONDS).catch(() => {})
		]);

		return json(payload, {
			headers: {
				ETag: `"${hash}"`,
				'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400'
			}
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[atlas/cards/${id}] Error:`, msg);
		return json({ ok: false, error: msg }, { status: 500 });
	}
};
