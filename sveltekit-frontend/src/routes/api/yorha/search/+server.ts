import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { evidence, cases, personsOfInterest } from '$lib/server/db/schema-postgres.js';
import { or, ilike, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordSearchQuery } from '$lib/server/analytics/search-analytics.js';

const yorhaSearchSchema = z.object({
	query: z.string().min(2, 'Query must be at least 2 characters').max(2000),
	limit: z.number().int().min(1).max(100).optional().default(20),
	sources: z.array(z.enum(['evidence', 'cases', 'persons'])).optional().default(['evidence', 'cases', 'persons']),
	vectorSearch: z.boolean().optional().default(true)
});

/**
 * POST /api/yorha/search
 * Unified search across evidence, cases, POIs + optional vector (Qdrant) rerank
 * Delegates heavy vector search to existing /api/rag/search infrastructure
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const raw = await request.json();
	const parsed = yorhaSearchSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { query, limit, sources, vectorSearch: useVector } = parsed.data;
	const pattern = `%${query}%`;

	recordSearchQuery({ query, pipeline: 'rag', cacheHit: false, userId: locals.user.id });

	const results: Array<{ type: string; id: string; title: string; snippet: string; score: number; metadata: Record<string, unknown> }> = [];

	// Parallel DB search across requested sources
	const searches: Promise<void>[] = [];

	if (sources.includes('evidence')) {
		searches.push(
			db.select({ id: evidence.id, title: evidence.title, description: evidence.description })
				.from(evidence)
				.where(or(ilike(evidence.title, pattern), ilike(evidence.description, pattern)))
				.orderBy(desc(evidence.updatedAt))
				.limit(limit)
				.$withCache({ config: { ex: 120 } })
				.then(rows => {
					for (const r of rows) {
						results.push({
							type: 'evidence', id: r.id, title: r.title,
							snippet: (r.description ?? '').slice(0, 200),
							score: 0.7, metadata: {},
						});
					}
				}).catch(() => {})
		);
	}

	if (sources.includes('cases')) {
		searches.push(
			db.select({ id: cases.id, title: cases.title, description: cases.description })
				.from(cases)
				.where(or(ilike(cases.title, pattern), ilike(cases.description, pattern)))
				.orderBy(desc(cases.updatedAt))
				.limit(limit)
				.$withCache({ config: { ex: 120 } })
				.then(rows => {
					for (const r of rows) {
						results.push({
							type: 'case', id: r.id, title: r.title,
							snippet: (r.description ?? '').slice(0, 200),
							score: 0.7, metadata: {},
						});
					}
				}).catch(() => {})
		);
	}

	if (sources.includes('persons')) {
		searches.push(
			db.select({ id: personsOfInterest.id, name: personsOfInterest.name, description: personsOfInterest.description, threatLevel: personsOfInterest.threatLevel })
				.from(personsOfInterest)
				.where(or(ilike(personsOfInterest.name, pattern), ilike(personsOfInterest.description, pattern)))
				.limit(limit)
				.$withCache({ config: { ex: 120 } })
				.then(rows => {
					for (const r of rows) {
						results.push({
							type: 'person', id: r.id, title: r.name,
							snippet: (r.description ?? '').slice(0, 200),
							score: 0.6, metadata: { threatLevel: r.threatLevel },
						});
					}
				}).catch(() => {})
		);
	}

	await Promise.all(searches);

	// Optional: vector rerank via Qdrant for semantic relevance
	if (useVector && results.length > 0) {
		try {
			const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');
			const embedding = await generateSingleEmbedding(query.slice(0, 512));

			if (embedding?.length) {
				const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
				const { results: vectorHits } = await qdrant.hybridSearch({
					collection: 'evidence_items',
					query,
					queryEmbedding: embedding,
					limit: Math.min(limit, 10),
					scoreThreshold: 0.3,
				});

				for (const hit of vectorHits) {
					const existing = results.find(r => r.id === String(hit.id));
					if (existing) {
						existing.score = Math.max(existing.score, hit.score ?? 0.5);
					} else {
						results.push({
							type: 'vector_match',
							id: String(hit.id),
							title: String((hit.payload as Record<string, unknown>)?.title ?? 'Vector match'),
							snippet: String((hit.payload as Record<string, unknown>)?.content ?? '').slice(0, 200),
							score: hit.score ?? 0.5,
							metadata: { source: 'qdrant' },
						});
					}
				}
			}
		} catch (e) {
			// Vector search is optional enhancement — don't fail the whole request
			console.warn('[yorha/search] Vector rerank failed:', (e as Error).message);
		}
	}

	// Sort by score descending
	results.sort((a, b) => b.score - a.score);

	return json({
		query,
		results: results.slice(0, limit),
		totalFound: results.length,
		sources,
		vectorSearchUsed: useVector,
	});
};