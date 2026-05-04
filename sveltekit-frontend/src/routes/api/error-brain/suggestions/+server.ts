/**
 * GET  /api/error-brain/suggestions
 *   ?routePath=... &applied=true|false &riskLevel=low|medium|high &limit=50 &cursor=<iso>
 *   → Paginated phase78 fix suggestions from error_suggestions table
 *
 * DELETE /api/error-brain/suggestions/:id  (query param id=)
 *   → Mark dismissed (sets applied=false won't help; we just delete for now)
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { errorSuggestionsTable } from '$lib/server/db/schema/error_suggestions.js';
import { eq, desc, and, lt } from 'drizzle-orm';

const getSchema = z.object({
	routePath: z.string().max(255).optional(),
	applied:   z.enum(['true', 'false']).optional(),
	riskLevel: z.enum(['low', 'medium', 'high']).optional(),
	limit:     z.coerce.number().int().min(1).max(100).default(50),
	cursor:    z.string().datetime().optional(),
});

const deleteSchema = z.object({
	id: z.string().uuid(),
});

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ suggestions: [], total: 0 }, { status: 401 });

	const parsed = getSchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) throw error(400, parsed.error.issues[0]?.message ?? 'Invalid query');

	const { routePath, applied, riskLevel, limit, cursor } = parsed.data;

	try {
		const filters = [];
		if (routePath) filters.push(eq(errorSuggestionsTable.routePath, routePath));
		if (applied !== undefined) filters.push(eq(errorSuggestionsTable.applied, applied === 'true'));
		if (riskLevel) filters.push(eq(errorSuggestionsTable.riskLevel, riskLevel));
		if (cursor) filters.push(lt(errorSuggestionsTable.createdAt, new Date(cursor)));

		const rows = await db
			.select()
			.from(errorSuggestionsTable)
			.where(filters.length ? and(...filters) : undefined)
			.orderBy(desc(errorSuggestionsTable.createdAt))
			.limit(limit);

		const nextCursor = rows.length === limit ? rows[rows.length - 1].createdAt?.toISOString() ?? null : null;

		return json({ suggestions: rows, total: rows.length, nextCursor });
	} catch (e) {
		console.error('[error-brain/suggestions] DB query failed:', (e as Error).message);
		return json({ suggestions: [], total: 0, nextCursor: null });
	}
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = deleteSchema.safeParse({ id: url.searchParams.get('id') });
	if (!parsed.success) throw error(400, 'Invalid or missing id');

	try {
		await db.delete(errorSuggestionsTable).where(eq(errorSuggestionsTable.id, parsed.data.id));
		return json({ success: true });
	} catch (e) {
		console.error('[error-brain/suggestions] delete failed:', (e as Error).message);
		return json({ success: false, error: 'Delete failed' }, { status: 500 });
	}
};
