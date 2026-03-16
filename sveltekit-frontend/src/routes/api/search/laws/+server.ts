/**
 * GET /api/search/laws
 *
 * Search statutes and legal provisions by query string with optional
 * jurisdiction and category filters.
 * Uses Drizzle ILIKE for text search against statutes table.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { statutes } from '$lib/server/db/schema-postgres.js';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';

type LawSearchRow = {
	id: string;
	title: string;
	section: string | null;
	jurisdiction: string | null;
	category: string | null;
	contentPreview: string;
	effectiveDate: Date | null;
	sourceUrl: string | null;
	createdAt: Date;
	score: number;
};

export const GET: RequestHandler = async ({ url }) => {
	const startTime = performance.now();

	const query = url.searchParams.get('query')?.trim() ?? '';
	const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '10', 10)));
	const jurisdiction = url.searchParams.get('jurisdiction') ?? undefined;
	const sectionType = url.searchParams.get('sectionType') ?? undefined;

	if (!query || query.length < 2) {
		return json({ results: [], total: 0, query, executionTimeMs: 0 });
	}

	try {
		const pattern = `%${query}%`;
		const prefixPattern = `${query}%`;
		const scoreExpr = sql<number>`
			CASE
				WHEN ${statutes.title} ILIKE ${prefixPattern} THEN 1.0
				WHEN ${statutes.section} ILIKE ${prefixPattern} THEN 0.95
				WHEN ${statutes.title} ILIKE ${pattern} THEN 0.85
				WHEN ${statutes.section} ILIKE ${pattern} THEN 0.8
				WHEN ${statutes.category} ILIKE ${pattern} THEN 0.62
				WHEN ${statutes.content} ILIKE ${pattern} THEN 0.5
				ELSE 0.35
			END
		`;
		const conditions = [
			or(
				ilike(statutes.title, pattern),
				ilike(statutes.content, pattern),
				ilike(statutes.section, pattern),
				ilike(statutes.category, pattern)
			)
		];

		if (jurisdiction) {
			conditions.push(eq(statutes.jurisdiction, jurisdiction));
		}
		if (sectionType) {
			conditions.push(eq(statutes.category, sectionType));
		}

		const rows = await db
			.select({
				id: statutes.id,
				title: statutes.title,
				section: statutes.section,
				jurisdiction: statutes.jurisdiction,
				category: statutes.category,
				contentPreview: sql<string>`LEFT(${statutes.content}, 300)`,
				effectiveDate: statutes.effectiveDate,
				sourceUrl: statutes.sourceUrl,
				createdAt: statutes.createdAt,
				score: scoreExpr,
			})
			.from(statutes)
			.where(and(...conditions))
			.orderBy(desc(scoreExpr), desc(statutes.createdAt))
			.limit(limit);

		const results = (rows as unknown as LawSearchRow[]).map((row) => ({
			id: row.id,
			title: row.section ? `${row.section} ${row.title}` : row.title,
			text: row.contentPreview,
			score: Number(row.score ?? 0),
			metadata: {
				section: row.section,
				jurisdiction: row.jurisdiction,
				category: row.category,
				sectionType: row.category,
				effectiveDate: row.effectiveDate,
				sourceUrl: row.sourceUrl,
				createdAt: row.createdAt,
			},
		}));

		const executionTimeMs = Math.round(performance.now() - startTime);

		return json({
			results,
			total: results.length,
			query,
			executionTimeMs
		});
	} catch (err) {
		console.error('[search/laws] error:', err);
		const executionTimeMs = Math.round(performance.now() - startTime);
		return json({ results: [], total: 0, query, executionTimeMs });
	}
};
