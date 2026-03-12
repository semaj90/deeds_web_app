import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const CASE_STATUS = ['open', 'in_progress', 'pending_review', 'closed', 'archived'] as const;
const CASE_PRIORITY = ['low', 'medium', 'high', 'urgent'] as const;

const caseUpdateSchema = z.object({
	title: z.string().min(1).max(500).optional(),
	description: z.string().max(10000).optional(),
	status: z.enum(CASE_STATUS).optional(),
	priority: z.enum(CASE_PRIORITY).optional()
});

const isUuid = (s: string) =>
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/**
 * GET /api/cases/[id]
 * Fetch a single case by ID
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const id = params.id;

		if (!id || !isUuid(id)) {
			return json({ message: 'Invalid case id' }, { status: 400 });
		}

		if (!locals.user) {
			return json({ message: 'Unauthorized' }, { status: 401 });
		}

		const caseData = await db
			.select()
			.from(cases)
			.where(eq(cases.id, id))
			.limit(1);

		if (caseData.length === 0) {
			return json({ message: 'Case not found' }, { status: 404 });
		}

		return json({ success: true, data: caseData[0] });
	} catch (err) {
		console.error('[api/cases/[id]] GET failed:', err);
		return json({ message: 'Internal server error' }, { status: 500 });
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

		const raw = await request.json();
		const parsed = caseUpdateSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const body = parsed.data;

		const updates: Partial<typeof cases.$inferSelect> = {};

		if (body.title) updates.title = body.title;
		if (body.description) updates.description = body.description;
		if (body.status) updates.status = body.status;
		if (body.priority) updates.priority = body.priority;

		const updated = await db
			.update(cases)
			.set(updates)
			.where(and(eq(cases.id, id), eq(cases.userId, locals.user.id)))
			.returning();

		if (updated.length === 0) {
			return json({ message: 'Case not found' }, { status: 404 });
		}

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

		const archived = await db
			.update(cases)
			.set({
				status: 'archived',
				updatedAt: sql`NOW()`
			})
			.where(and(eq(cases.id, id), eq(cases.userId, locals.user.id)))
			.returning();

		if (archived.length === 0) {
			return json({ message: 'Case not found or unauthorized' }, { status: 404 });
		}

		return json({
			success: true,
			message: 'Case archived successfully'
		});
	} catch (err) {
		console.error('[api/cases/[id]] DELETE failed:', err);
		return json({ message: 'Internal server error' }, { status: 500 });
	}
};
