/**
 * GET  /api/fictional-cases — List fictional cases with filters
 * POST /api/fictional-cases — (reserved for future case generation)
 *
 * Query params: category, jurisdiction, q (search), limit, offset
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { db } from '$lib/server/db/client';
import { fictionalCases, fictionalCaseCharges } from '$lib/server/db/schema-postgres.js';
import { eq, ilike, or, desc, sql, and } from 'drizzle-orm';
import { z } from 'zod';

const listSchema = z.object({
	category: z.string().optional(),
	jurisdiction: z.string().optional(),
	q: z.string().max(500).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0),
});

export const GET: RequestHandler = async ({ url, locals, request }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const parsed = listSchema.safeParse({
		category: url.searchParams.get('category') ?? undefined,
		jurisdiction: url.searchParams.get('jurisdiction') ?? undefined,
		q: url.searchParams.get('q')?.trim() ?? undefined,
		limit: url.searchParams.get('limit') ?? undefined,
		offset: url.searchParams.get('offset') ?? undefined,
	});

	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid params' }, { status: 400 });
	}

	const { category, jurisdiction, q, limit, offset } = parsed.data;

	try {
		const conditions = [];

		if (category) {
			conditions.push(sql`${fictionalCases.category} = ${category}`);
		}
		if (jurisdiction) {
			conditions.push(eq(fictionalCases.jurisdiction, jurisdiction as typeof fictionalCases.jurisdiction.enumValues[number]));
		}
		if (q) {
			const pattern = `%${q}%`;
			conditions.push(
				or(
					ilike(fictionalCases.charge, pattern),
					ilike(fictionalCases.defendantName, pattern),
					ilike(fictionalCases.narrative, pattern),
					ilike(fictionalCases.primaryStatute, pattern),
				)
			);
		}

		const where = conditions.length > 0 ? and(...conditions) : undefined;

		const [rows, countResult] = await Promise.all([
			db
				.select({
					id: fictionalCases.id,
					caseId: fictionalCases.caseId,
					category: fictionalCases.category,
					charge: fictionalCases.charge,
					primaryStatute: fictionalCases.primaryStatute,
					defendantName: fictionalCases.defendantName,
					incidentDate: fictionalCases.incidentDate,
					jurisdictionCity: fictionalCases.jurisdictionCity,
					jurisdiction: fictionalCases.jurisdiction,
					financialLoss: fictionalCases.financialLoss,
					generatedBy: fictionalCases.generatedBy,
					createdAt: fictionalCases.createdAt,
				})
				.from(fictionalCases)
				.where(where)
				.orderBy(desc(fictionalCases.createdAt))
				.limit(limit)
				.offset(offset),
			db
				.select({ count: sql<number>`count(*)` })
				.from(fictionalCases)
				.where(where),
		]);

		// Category stats
		const categoryStats = await db
			.select({
				category: fictionalCases.category,
				count: sql<number>`count(*)`,
			})
			.from(fictionalCases)
			.groupBy(fictionalCases.category)
			.orderBy(desc(sql`count(*)`));

		const responseData = {
			cases: rows,
			total: Number(countResult[0]?.count ?? 0),
			limit,
			offset,
			categoryStats,
		};

		const { etag, isMatch } = checkETag(responseData, request.headers);
		if (isMatch) return notModified(etag);

		return json(responseData, {
			headers: { ...cacheControl.private, ETag: etag }
		});
	} catch (err) {
		console.error('[fictional-cases] error:', err);
		return json({
      cases: [],
      total: 0,
      limit,
      offset,
      categoryStats: [],
    }, {
			headers: cacheControl.private
		});
	}
};
