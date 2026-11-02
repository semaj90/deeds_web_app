import { db } from '$lib/server/db/client.js';
import { invalidateCaseCache } from '$lib/server/cache/invalidation.js';
import { cases } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { syncCaseToGraph } from '$lib/server/graph/pg-neo4j-sync.js';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

import { insertCaseSchema } from '$lib/server/db/zod-schemas.js';

const caseUpdateSchema = insertCaseSchema
	.pick({
		title: true,
		description: true,
		status: true,
		priority: true
	})
	.partial();

const isUuid = (s: string) =>
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function buildCaseWriteFilter(id: string, user: App.Locals['user'] | undefined) {
	const devBypass = process.env.DEV_BYPASS_AUTH === 'true';
	const numericUserId = user?.id ? Number(user.id) : NaN;
	if (devBypass || user?.role === 'admin' || Number.isNaN(numericUserId)) {
		return eq(cases.id, id);
	}
	return and(eq(cases.id, id), or(eq(cases.userId, numericUserId), isNull(cases.userId)));
}

/**
 * GET /api/cases/[id]
 * Fetch a single case by ID (stable top-level JSON shape: { success, data }).
 */
export const GET: RequestHandler = async ({ locals, params, request }) => {
	try {
		const id = params.id;
		const devBypass = process.env.DEV_BYPASS_AUTH === 'true';

		if (!id || !isUuid(id)) {
			return json({ success: false, data: null, message: 'Invalid case id' }, { status: 400 });
		}

		if (!locals.user && !devBypass) {
			return json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 });
		}

		const caseData = await db.select().from(cases).where(eq(cases.id, id)).limit(1);

		if (caseData.length === 0) {
			return json({ success: false, data: null, message: 'Case not found' }, { status: 404 });
		}

		const responseData = { success: true, data: caseData[0] };
		const { etag, isMatch } = checkETag(responseData, request.headers);
		if (isMatch) return notModified(etag);

		return json(responseData, {
			headers: { ...cacheControl.private, ETag: etag }
		});
	} catch (err) {
		console.error('[api/cases/[id]] GET failed:', err);
		return json(
			{ success: false, data: null, _degraded: true },
			{ headers: cacheControl.private }
		);
	}
};

/**
 * PATCH /api/cases/[id]
 * Update a single case
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	try {
		const id = params.id;
		const devBypass = process.env.DEV_BYPASS_AUTH === 'true';

		if (!id || !isUuid(id)) {
			return json({ message: 'Invalid case id' }, { status: 400 });
		}

		if (!locals.user && !devBypass) {
			return json({ message: 'Unauthorized' }, { status: 401 });
		}

		let raw: unknown;
		try {
			raw = await request.json();
		} catch {
			return json({ message: 'Invalid JSON payload' }, { status: 400 });
		}

		const parsed = caseUpdateSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const body = parsed.data;

		const updates: Partial<typeof cases.$inferSelect> = {};

		if (body.title !== undefined) updates.title = body.title;
		if (body.description !== undefined) updates.description = body.description;
		if (body.status !== undefined) updates.status = body.status;
		if (body.priority !== undefined) updates.priority = body.priority;

		const updated = await db
			.update(cases)
			.set({
				...updates,
				updatedAt: sql`NOW()`
			})
			.where(buildCaseWriteFilter(id, locals.user))
			.returning();

		if (updated.length === 0) {
			return json({ message: 'Case not found' }, { status: 404 });
		}

		if (locals.user?.id) {
			await invalidateCaseCache(updated[0].id, 'case_update', locals.user.id).catch((err) =>
				console.warn('[api/cases/[id]] Cache invalidation failed:', err)
			);
		}

		// Sync updated case to Neo4j graph (non-blocking)
		syncCaseToGraph(id).catch((err) => console.warn('[neo4j-sync] case update:', err));

		return json({
			success: true,
			data: updated[0],
			message: 'Case updated successfully'
		});
	} catch (err) {
		console.error('[api/cases/[id]] PATCH failed:', err);
		return json({ message: 'Internal server error' }, { status: 500 });
	}
};

/**
 * DELETE /api/cases/[id]
 * Archive a single case (soft delete)
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		const id = params.id;
		const devBypass = process.env.DEV_BYPASS_AUTH === 'true';

		if (!id || !isUuid(id)) {
			return json({ message: 'Invalid case id' }, { status: 400 });
		}

		if (!locals.user && !devBypass) {
			return json({ message: 'Unauthorized' }, { status: 401 });
		}

		const archived = await db
			.update(cases)
			.set({
				status: 'archived',
				updatedAt: sql`NOW()`
			})
			.where(buildCaseWriteFilter(id, locals.user))
			.returning();

		if (archived.length === 0) {
			return json({ message: 'Case not found or unauthorized' }, { status: 404 });
		}

		if (locals.user?.id) {
			await invalidateCaseCache(id, 'case_update', locals.user.id).catch((err) =>
				console.warn('[api/cases/[id]] Cache invalidation failed:', err)
			);
		}

		// Sync archived status to Neo4j graph (non-blocking)
		syncCaseToGraph(id).catch((err) => console.warn('[neo4j-sync] case archive:', err));

		return json({
			success: true,
			message: 'Case archived successfully'
		});
	} catch (err) {
		console.error('[api/cases/[id]] DELETE failed:', err);
		return json({ message: 'Internal server error' }, { status: 500 });
	}
};
