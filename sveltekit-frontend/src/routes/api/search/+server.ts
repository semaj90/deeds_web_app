import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { cases, evidence, personsOfInterest, citations } from '$lib/server/db/schema-postgres.js';
import { ilike, or, desc, sql } from 'drizzle-orm';

/**
 * GET /api/search
 * Unified search across cases, evidence, POI, and citations
 *
 * Query params:
 *   q       - search text (required, min 2 chars)
 *   type    - 'cases' | 'evidence' | 'poi' | 'citations' | 'all' (default: all)
 *   limit   - max results per type (default: 10, max: 50)
 */
export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const type = url.searchParams.get('type') ?? 'all';
	const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 10)));

	if (!q || q.length < 2) {
		return json({ error: 'Query must be at least 2 characters' }, { status: 400 });
	}

	const pattern = `%${q}%`;
	const results: Record<string, unknown[]> = {};

	try {
		const searches = [];

		if (type === 'all' || type === 'cases') {
			searches.push(
				db
					.select({
						id: cases.id,
						title: cases.title,
						description: cases.description,
						status: cases.status,
						createdAt: cases.createdAt,
					})
					.from(cases)
					.where(or(ilike(cases.title, pattern), ilike(cases.description, pattern)))
					.orderBy(desc(cases.createdAt))
					.limit(limit)
					.then((rows) => { results.cases = rows; })
			);
		}

		if (type === 'all' || type === 'evidence') {
			searches.push(
				db
					.select({
						id: evidence.id,
						title: evidence.title,
						description: evidence.description,
						type: evidence.type,
						createdAt: evidence.createdAt,
					})
					.from(evidence)
					.where(or(ilike(evidence.title, pattern), ilike(evidence.description, pattern)))
					.orderBy(desc(evidence.createdAt))
					.limit(limit)
					.then((rows) => { results.evidence = rows; })
			);
		}

		if (type === 'all' || type === 'poi') {
			searches.push(
				db
					.select({
						id: personsOfInterest.id,
						name: personsOfInterest.name,
						description: personsOfInterest.description,
						threatLevel: personsOfInterest.threatLevel,
						status: personsOfInterest.status,
					})
					.from(personsOfInterest)
					.where(or(ilike(personsOfInterest.name, pattern), ilike(personsOfInterest.description, pattern)))
					.orderBy(desc(personsOfInterest.createdAt))
					.limit(limit)
					.then((rows) => { results.poi = rows; })
			);
		}

		if (type === 'all' || type === 'citations') {
			searches.push(
				db
					.select({
						id: citations.id,
						caseId: citations.caseId,
						pageNumber: citations.pageNumber,
						createdAt: citations.createdAt,
						quotedText: sql<string>`"citations"."quoted_text"`,
						formattedCitation: sql<string>`"citations"."formatted_citation"`,
					})
					.from(citations)
					.where(
						or(
							sql`"citations"."quoted_text" ILIKE ${pattern}`,
							sql`"citations"."formatted_citation" ILIKE ${pattern}`
						)
					)
					.orderBy(desc(citations.createdAt))
					.limit(limit)
					.then((rows) => { results.citations = rows; })
			);
		}

		await Promise.all(searches);

		const totalResults = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

		return json({ query: q, type, totalResults, results });
	} catch (err) {
		console.error('[search] error:', err);
		return json({ query: q, type, totalResults: 0, results: {} });
	}
};
