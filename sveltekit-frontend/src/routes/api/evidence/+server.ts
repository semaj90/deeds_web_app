import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';

/**
 * GET /api/evidence
 * List evidence items with optional filtering and pagination
 */
export const GET: RequestHandler = async ({ url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
	const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
	const offset = (page - 1) * limit;
	const search = url.searchParams.get('search')?.trim() ?? '';
	const caseId = url.searchParams.get('caseId') ?? '';
	const type = url.searchParams.get('type') ?? '';

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
