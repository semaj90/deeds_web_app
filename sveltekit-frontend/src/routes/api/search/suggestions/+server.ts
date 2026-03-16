/**
 * GET /api/search/suggestions
 *
 * Return autocomplete suggestions for a partial search query.
 * Uses prefix matching on case titles or statute titles.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { cases, statutes } from '$lib/server/db/schema-postgres.js';
import { desc, ilike, or, sql } from 'drizzle-orm';

function uniqueValues(values: Array<string | null | undefined>): string[] {
	return Array.from(
		new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))
	).slice(0, 10);
}

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('query')?.trim() ?? '';
	const type = url.searchParams.get('type') ?? 'laws';
	const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') ?? '10', 10)));

	if (!query || query.length < 2) {
		return json({ suggestions: [] });
	}

	try {
		const pattern = `${query}%`;
		let suggestions: string[] = [];

		if (type === 'cases') {
			const caseSuggestionScore = sql<number>`
				CASE
					WHEN ${cases.title} ILIKE ${pattern} THEN 1
					WHEN ${cases.caseNumber} ILIKE ${pattern} THEN 0.95
					ELSE 0.5
				END
			`;
			const rows = await db
				.select({
					value: sql<string>`
						CASE
							WHEN ${cases.caseNumber} IS NOT NULL AND ${cases.caseNumber} <> '' THEN ${cases.caseNumber} || ' - ' || ${cases.title}
							ELSE ${cases.title}
						END
					`,
					score: caseSuggestionScore,
					createdAt: cases.createdAt,
				})
				.from(cases)
				.where(or(ilike(cases.title, pattern), ilike(cases.caseNumber, pattern)))
				.orderBy(desc(caseSuggestionScore), desc(cases.createdAt))
				.limit(limit);
			suggestions = uniqueValues(rows.map((row) => row.value));
		} else {
			const lawSuggestionScore = sql<number>`
				CASE
					WHEN ${statutes.title} ILIKE ${pattern} THEN 1
					WHEN ${statutes.section} ILIKE ${pattern} THEN 0.95
					ELSE 0.5
				END
			`;
			const rows = await db
				.select({
					value: sql<string>`
						CASE
							WHEN ${statutes.section} IS NOT NULL AND ${statutes.section} <> '' THEN ${statutes.section} || ' - ' || ${statutes.title}
							ELSE ${statutes.title}
						END
					`,
					createdAt: statutes.createdAt,
				})
				.from(statutes)
				.where(or(ilike(statutes.title, pattern), ilike(statutes.section, pattern)))
				.orderBy(desc(lawSuggestionScore), desc(statutes.createdAt))
				.limit(limit);
			suggestions = uniqueValues(rows.map((row) => row.value));
		}

		return json({ suggestions });
	} catch (err) {
		console.error('[search/suggestions] error:', err);
		return json({ suggestions: [] });
	}
};