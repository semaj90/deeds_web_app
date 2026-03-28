import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';

const evidenceListSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	search: z.string().max(500).optional().default(''),
	caseId: z.string().max(100).optional().default(''),
	type: z.string().max(100).optional().default(''),
});

/**
 * GET /api/evidence
 * List evidence items with optional filtering and pagination
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = evidenceListSchema.safeParse({
		page: url.searchParams.get('page') ?? undefined,
		limit: url.searchParams.get('limit') ?? undefined,
		search: url.searchParams.get('search')?.trim(),
		caseId: url.searchParams.get('caseId'),
		type: url.searchParams.get('type'),
	});
	if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' }, { status: 400 });
	const { page, limit, search, caseId, type } = parsed.data;
	const offset = (page - 1) * limit;

	try {
		const conditions = [];
		if (caseId) conditions.push(eq(evidence.caseId, caseId));
		if (type) conditions.push(eq(evidence.type, type));
		if (search) {
			conditions.push(
				or(
					ilike(evidence.title, `%${search}%`),
					ilike(evidence.description, `%${search}%`),
					ilike(evidence.fileName, `%${search}%`)
				)!
			);
		}

		const where = conditions.length > 0
			? conditions.length === 1 ? conditions[0] : sql`${conditions[0]} AND ${conditions.slice(1).reduce((a, b) => sql`${a} AND ${b}`)}`
			: undefined;

		const [items, countResult] = await Promise.all([
			db
				.select({
					id: evidence.id,
					caseId: evidence.caseId,
					title: evidence.title,
					description: evidence.description,
					type: evidence.type,
					evidenceType: evidence.evidenceType,
					fileName: evidence.fileName,
					fileType: evidence.fileType,
					fileSize: evidence.fileSize,
					mimeType: evidence.mimeType,
					fileUrl: evidence.fileUrl,
					evidenceNumber: evidence.evidenceNumber,
					source: evidence.source,
					summary: evidence.summary,
					tags: evidence.tags,
					aiTags: evidence.aiTags,
					collectedAt: evidence.collectedAt,
					collectedBy: evidence.collectedBy,
					createdAt: evidence.createdAt,
					updatedAt: evidence.updatedAt,
				})
				.from(evidence)
				.where(where)
				.orderBy(desc(evidence.createdAt))
				.limit(limit)
				.offset(offset),
			db
				.select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
				.from(evidence)
				.where(where),
		]);

		return json({
			evidence: items,
			total: countResult[0]?.count ?? 0,
			page,
			limit,
			totalPages: Math.ceil((countResult[0]?.count ?? 0) / limit),
		});
	} catch (err) {
		console.error('[evidence] GET list error:', err);
		return json({ evidence: [], total: 0, page: 1, limit, totalPages: 0 });
	}
};
