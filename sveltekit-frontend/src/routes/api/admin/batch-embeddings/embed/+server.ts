import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRedis } from '$lib/server/redis.js';
import { embedText } from '$lib/server/embedding/embed.js';
import { persistCanonicalSemanticPacketEmbedding } from '$lib/server/embedding/semantic-packet-writer.js';
import { computePacketKey as computeCanonicalPacketKey } from '$lib/server/atlas/identity/packet-key-builder.js';
import { resolveCanonicalPacketKey } from '$lib/server/atlas/identity/packet-identity-resolver.js';

interface EmbedRequest {
	packetKey?: string;
	sourceRef?: string;
	treeNodeId?: string;
	titleId?: string;
	text: string;
}

interface EmbedResponse {
	embedding: number[];
	cacheHit: boolean;
	duration: number;
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const startTime = Date.now();

	try {
		const body = (await request.json()) as EmbedRequest;
		const packetKey = body.packetKey?.trim() ?? '';
		const sourceRef = body.sourceRef?.trim() ?? '';
		const treeNodeId = body.treeNodeId?.trim() ?? '';
		const titleId = body.titleId?.trim() ?? '';
		const structuredPacketKey = sourceRef && treeNodeId && titleId
			? computeCanonicalPacketKey(sourceRef, treeNodeId, titleId)
			: '';
		const resolvedPacketKey = packetKey
			? await resolveCanonicalPacketKey(packetKey)
			: structuredPacketKey;
		const { text } = body;

		if ((!packetKey && !sourceRef) || !resolvedPacketKey || !text) {
			return json(
				{ embedding: [], cacheHit: false, duration: 0, error: 'Missing packetKey or sourceRef/treeNodeId/titleId or text' },
				{ status: 400 }
			);
		}

		if (structuredPacketKey && packetKey && resolvedPacketKey !== structuredPacketKey) {
			return json(
				{
					embedding: [],
					cacheHit: false,
					duration: 0,
					error: 'Packet key alias does not resolve to the supplied structural identity',
				},
				{ status: 409 }
			);
		}

		// 1. Check Bitfrost L1 cache (Redis exact-match via bifrost:packet key)
		const bifrostKey = `bifrost:packet:${resolvedPacketKey}`;
		const redis = getRedis();

		let cacheHit = false;
		let embedding: number[] = [];

		try {
			const cached = await redis.get(bifrostKey);
			if (cached) {
				embedding = JSON.parse(cached);
				cacheHit = true;
				const duration = Date.now() - startTime;
				return json({ embedding, cacheHit, duration });
			}
		} catch (e) {
			// Malformed cache or Redis down, continue to compute
		}

		// 2. Embed via canonical Ollama embeddinggemma (via embedText service)
		// embedText is pure computation — it does NOT persist to Postgres or Redis
		// itself (verified 2026-08-09); this endpoint owns both cache and canonical
		// persistence below.
		// Falls back: gRPC → QUIC → HTTP → local fallback
		let isRealSemanticEmbedding = true;
		try {
			embedding = await embedText(text.trim());
		} catch (err) {
			console.error(`Failed to embed packet ${resolvedPacketKey}:`, err);
			// Fallback: deterministic stub, NOT a real semantic_768 embedding.
			// Same dimension (768) as the real thing, so it must never be tagged
			// with the semantic_768 representation_id — dimension alone cannot
			// prove provenance (see representation-lineage audit, 2026-08-09).
			embedding = generateFallbackEmbedding(text);
			isRealSemanticEmbedding = false;
		}

		const duration = Date.now() - startTime;

		// 3. Store in Bitfrost cache (Redis) with 1-hour TTL for fast re-access
		try {
			await redis.setex(bifrostKey, 3600, JSON.stringify(embedding));
		} catch (e) {
			// Non-blocking: embed succeeded even if Bitfrost cache fails
			console.warn(`Failed to cache embedding for ${resolvedPacketKey}:`, e);
		}

		// 4. Persist canonical lineage in Postgres only for real semantic embeddings.
		// Deterministic fallback vectors stay cache-only and must not become
		// authoritative semantic lineage.
		if (isRealSemanticEmbedding) {
			try {
				await persistCanonicalSemanticPacketEmbedding({
					packetKey: resolvedPacketKey,
					sourceRef: sourceRef || resolvedPacketKey,
					treeNodeId: treeNodeId || null,
					titleId: titleId || null,
					sourcePath: sourceRef || resolvedPacketKey,
					vector: embedding,
				});
			} catch (e) {
				// Non-blocking: cache write succeeded even if Postgres fails
				console.warn(`Failed to persist packet ${resolvedPacketKey}:`, e);
			}
		}

		return json({ embedding, cacheHit, duration });
	} catch (err) {
		console.error('Embedding error:', err);
		return json(
			{ embedding: [], cacheHit: false, duration: Date.now() - startTime, error: String(err) },
			{ status: 500 }
		);
	}
};

// Fallback embedding: generates a deterministic 768-dim vector from text
// Used only when embedText fails and no cache is available
function generateFallbackEmbedding(text: string): number[] {
	const embedding = new Array(768).fill(0);

	let hash = 0;
	for (let i = 0; i < text.length; i++) {
		const char = text.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}

	for (let i = 0; i < 768; i++) {
		hash = (hash * 9301 + 49297) % 233280;
		embedding[i] = (hash / 233280) * 2 - 1;
	}

	// L2-normalize
	let norm = 0;
	for (const val of embedding) {
		norm += val * val;
	}
	norm = Math.sqrt(norm);

	if (norm > 0) {
		for (let i = 0; i < 768; i++) {
			embedding[i] /= norm;
		}
	}

	return embedding;
}
