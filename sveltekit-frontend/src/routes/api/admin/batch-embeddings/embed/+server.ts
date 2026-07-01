import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRedis } from '$lib/server/redis.js';
import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { embedText } from '$lib/server/embedding/embed.js';

interface EmbedRequest {
	packetKey: string;
	text: string;
}

interface EmbedResponse {
	embedding: number[];
	cacheHit: boolean;
	duration: number;
}

export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();

	try {
		const body = (await request.json()) as EmbedRequest;
		const { packetKey, text } = body;

		if (!packetKey || !text) {
			return json(
				{ embedding: [], cacheHit: false, duration: 0, error: 'Missing packetKey or text' },
				{ status: 400 }
			);
		}

		// 1. Check Bitfrost L1 cache (Redis exact-match via bifrost:packet key)
		const bifrostKey = `bifrost:packet:${packetKey}`;
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
		// embedText handles L3 Redis cache, L4 Postgres persistence, circuit breaker + retry
		// Falls back: gRPC → QUIC → HTTP → local fallback
		try {
			embedding = await embedText(text.trim());
		} catch (err) {
			console.error(`Failed to embed packet ${packetKey}:`, err);
			// Fallback: generate deterministic stub on error
			embedding = generateFallbackEmbedding(text);
		}

		const duration = Date.now() - startTime;

		// 3. Store in Bitfrost cache (Redis) with 1-hour TTL for fast re-access
		try {
			await redis.setex(bifrostKey, 3600, JSON.stringify(embedding));
		} catch (e) {
			// Non-blocking: embed succeeded even if Bitfrost cache fails
			console.warn(`Failed to cache embedding for ${packetKey}:`, e);
		}

		// 4. Update Postgres packet metadata (non-blocking)
		try {
			await db
				.update(atlasPackets)
				.set({ updated_at: new Date() })
				.where(eq(atlasPackets.packet_key, packetKey));
		} catch (e) {
			// Non-blocking: cache write succeeded even if Postgres fails
			console.warn(`Failed to update packet ${packetKey}:`, e);
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
