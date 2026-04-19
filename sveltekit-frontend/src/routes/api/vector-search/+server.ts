import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { rateLimitOrRespond, RateLimitPresets } from '$lib/server/middleware/rate-limit.js';
import { recordSearchQuery } from '$lib/server/analytics/search-analytics.js';

const vectorSearchSchema = z.object({
	query: z.string().min(1).max(10000),
	limit: z.number().min(1).max(50).default(10),
	threshold: z.number().min(0).max(1).default(0.5)
});

/** POST /api/vector-search — Qdrant vector similarity search across evidence/documents */
export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	// Rate limiting: 50 requests per minute (search preset)
	const rateLimited = await rateLimitOrRespond(event, RateLimitPresets.search);
	if (rateLimited) return rateLimited;

	try {
		const raw = await event.request.json();
		const parsed = vectorSearchSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { query, limit, threshold } = parsed.data;
		recordSearchQuery({ query, pipeline: 'rag', cacheHit: false, userId: event.locals.user.id });

		// Generate embedding for the query
		const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');
		const embResult = await generateEmbeddings([query]);
		const embedding = embResult?.vectors?.[0];

		if (!embedding || embedding.length !== 768) {
			return json([]);
		}

		// Search across evidence and document collections
		const { QdrantClient } = await import('@qdrant/js-client-rest');
		const { ENV } = await import('$lib/server/env.server.js');
		const client = new QdrantClient({ url: ENV.QDRANT_URL });

		const results: Array<{ id: string; title: string; score: number; tags?: string[] }> = [];

		// Search evidence_items collection
		try {
			const evidenceResults = await client.search('evidence_items', {
				vector: embedding,
				limit,
				score_threshold: threshold,
				with_payload: true
			});

			for (const r of evidenceResults) {
				const payload = r.payload as Record<string, unknown> | null;
				results.push({
					id: String(r.id),
					title: String(payload?.title ?? payload?.filename ?? 'Evidence'),
					score: r.score,
					tags: Array.isArray(payload?.tags) ? (payload.tags as string[]) : []
				});
			}
		} catch {
			// Collection may not exist
		}

		// Search legal_documents collection
		try {
			const docResults = await client.search('legal_documents', {
				vector: embedding,
				limit,
				score_threshold: threshold,
				with_payload: true
			});

			for (const r of docResults) {
				const payload = r.payload as Record<string, unknown> | null;
				results.push({
					id: String(r.id),
					title: String(payload?.title ?? payload?.filename ?? 'Document'),
					score: r.score,
					tags: Array.isArray(payload?.tags) ? (payload.tags as string[]) : []
				});
			}
		} catch {
			// Collection may not exist
		}

		// Sort by score descending, deduplicate, limit
		const seen = new Set<string>();
		const deduplicated = results
			.sort((a, b) => b.score - a.score)
			.filter((r) => {
				if (seen.has(r.id)) return false;
				seen.add(r.id);
				return true;
			})
			.slice(0, limit);

		return json(deduplicated);
	} catch (err) {
		console.error('[/api/vector-search] error:', err);
		return json([], { status: 500 });
	}
};