/**
 * CH-ROM97 Cartridge Export API
 *
 * POST { caseId, collections? }
 * → Scrolls Qdrant evidence_items for caseId
 * → Builds CH-ROM97 binary cartridge
 * → Caches in Redis (30 min TTL)
 * → Returns application/octet-stream
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { QdrantClient } from '@qdrant/js-client-rest';
import { ENV } from '$lib/server/env.server.js';
import type { Redis } from 'ioredis';
import { getRedis } from '$lib/server/redis.js';
import { buildCartridge, type RuneData, type CartridgeMetadata } from '$lib/server/cartridge/chr97-builder.js';
import crypto from 'crypto';
import { z } from 'zod';

const cartridgeExportSchema = z.object({
	caseId: z.string().min(1, 'caseId is required').max(500),
	collections: z.array(z.string().max(200)).max(10).optional()
});

const CACHE_TTL = 1800; // 30 minutes

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = cartridgeExportSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const { caseId, collections } = parsed.data;

	// Check Redis cache
	const cacheKey = `cartridge:${caseId}`;
	try {
		const cached = await redis.getBuffer(cacheKey);
		if (cached) {
			const bytes = new Uint8Array(cached);
			return new Response(bytes, {
				headers: cartridgeHeaders(caseId, bytes),
			});
		}
	} catch {
		// Redis unavailable — proceed without cache
	}

	// Connect to Qdrant
	let qdrant: QdrantClient;
	try {
		qdrant = new QdrantClient({ url: ENV.QDRANT_URL });
	} catch (err) {
		return json({ error: 'Qdrant connection failed' }, { status: 503 });
	}

	// Scroll all evidence chunks matching this caseId
	const collectionName = collections?.[0] ?? 'evidence_items';
	const allPoints: Array<{ id: string | number; vector: number[]; payload: Record<string, unknown> }> = [];

	try {
		let nextOffset: string | number | undefined = undefined;
		const batchSize = 100;

		// Paginated scroll
		for (let page = 0; page < 100; page++) {
			const scrollResult = await qdrant.scroll(collectionName, {
				filter: {
					must: [{ key: 'case_id', match: { value: caseId } }],
				},
				limit: batchSize,
				offset: nextOffset,
				with_vector: true,
				with_payload: true,
			});

			if (!scrollResult.points || scrollResult.points.length === 0) break;

			for (const point of scrollResult.points) {
				// Extract the content vector (may be named or default)
				let vector: number[];
				if (Array.isArray(point.vector)) {
					vector = point.vector as number[];
				} else if (point.vector && typeof point.vector === 'object' && 'content' in point.vector) {
					vector = (point.vector as Record<string, number[]>).content;
				} else {
					continue; // Skip points without vectors
				}

				allPoints.push({
					id: point.id,
					vector,
					payload: (point.payload ?? {}) as Record<string, unknown>,
				});
			}

			nextOffset = (scrollResult.next_page_offset as string | number | undefined) ?? undefined;
			if (!nextOffset) break;
		}
	} catch (err) {
		console.error('[cartridge-export] Qdrant scroll error:', err);
		return json({ error: 'Qdrant scroll failed' }, { status: 502 });
	}

	if (allPoints.length === 0) {
		return json({
			error: 'No evidence chunks found for this caseId',
			caseId,
			collection: collectionName,
		}, { status: 404 });
	}

	// Build rune data from Qdrant points
	const sources = new Set<string>();
	const runes: RuneData[] = allPoints.map((point, i) => {
		const payload = point.payload;
		const sourceName = String(payload.source_name ?? payload.filename ?? 'unknown');
		sources.add(sourceName);

		return {
			id: i,
			clusterId: typeof payload.chunk_index === 'number' ? Math.floor(payload.chunk_index / 5) : 0,
			embedding: point.vector,
			text: String(payload.text ?? payload.content ?? ''),
			sourceId: String(payload.evidence_id ?? point.id),
			sourceName,
			entities: Array.isArray(payload.entities) ? payload.entities.map(String) : [],
		};
	});

	// Build metadata
	const metadata: CartridgeMetadata = {
		caseId,
		createdAt: new Date().toISOString(),
		runeCount: runes.length,
		embeddingDim: runes[0].embedding.length,
		collections: [collectionName],
		sources: [...sources],
	};

	// Build cartridge binary
	const cartridgeBuf = buildCartridge(runes, metadata);
	const cartridgeBytes = new Uint8Array(cartridgeBuf);

	// Generate cartridge ID
	const cartridgeId = crypto.createHash('sha256')
		.update(`${caseId}:${runes.length}:${metadata.createdAt}`)
		.digest('hex')
		.slice(0, 16);

	// Cache in Redis (non-blocking)
	redis.set(cacheKey, cartridgeBuf, 'EX', CACHE_TTL).catch(() => {});

	return new Response(cartridgeBytes, {
		headers: {
			...cartridgeHeaders(caseId, cartridgeBytes),
			'X-Cartridge-Id': cartridgeId,
			'X-Rune-Count': String(runes.length),
		},
	});
};

function cartridgeHeaders(caseId: string, buf: Buffer | Uint8Array): Record<string, string> {
	return {
		'Content-Type': 'application/octet-stream',
		'Content-Length': String(buf.length),
		'Content-Disposition': `attachment; filename="case-${caseId}.chr97"`,
		'X-Case-Id': caseId,
		'Cache-Control': 'private, max-age=1800',
	};
}
