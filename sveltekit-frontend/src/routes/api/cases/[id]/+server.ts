import { db } from '$lib/server/db/client.js';
import { invalidateCaseCache } from '$lib/server/cache/invalidation.js';
import { cases } from '$lib/server/db/schema.js';
import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { syncCaseToGraph } from '$lib/server/graph/pg-neo4j-sync.js';
import { authorizedCaseFilter, getAuthorizedCase } from '$lib/server/case-access.js';

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
	if (!user) return null;
	return authorizedCaseFilter(id, Number(user.id));
}

/**
 * GET /api/cases/[id]
 * Fetch a single case by ID (stable top-level JSON shape: { success, data }).
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const headers = { 'cache-control': 'private, no-store' };
	try {
		const id = params.id;

		if (!id || !isUuid(id)) {
			return json({ success: false, data: null, message: 'Invalid case id' }, { status: 400, headers });
		}

		if (!locals.user) {
			return json({ success: false, data: null, message: 'Unauthorized' }, { status: 401, headers });
		}

		const caseData = await getAuthorizedCase(id, Number(locals.user.id));

		if (!caseData) {
			return json({ success: false, data: null, message: 'Case not found' }, { status: 404, headers });
		}

		return json({ success: true, data: caseData }, { headers });
	} catch (err) {
		console.error('[api/cases/[id]] GET failed:', err);
		return json(
			{ success: false, data: null, message: 'Case details are temporarily unavailable' },
			{ status: 503, headers }
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

		if (!id || !isUuid(id)) {
			return json({ message: 'Invalid case id' }, { status: 400 });
		}

		if (!locals.user) {
			return json({ message: 'Unauthorized' }, { status: 401 });
		}
		const writeFilter = buildCaseWriteFilter(id, locals.user);
		if (!writeFilter) return json({ message: 'Unauthorized' }, { status: 401 });

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
			.where(writeFilter)
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

		if (!id || !isUuid(id)) {
			return json({ message: 'Invalid case id' }, { status: 400 });
		}

		if (!locals.user) {
			return json({ message: 'Unauthorized' }, { status: 401 });
		}
		const writeFilter = buildCaseWriteFilter(id, locals.user);
		if (!writeFilter) return json({ message: 'Unauthorized' }, { status: 401 });

		const archived = await db
			.update(cases)
			.set({
				status: 'archived',
				updatedAt: sql`NOW()`
			})
			.where(writeFilter)
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
