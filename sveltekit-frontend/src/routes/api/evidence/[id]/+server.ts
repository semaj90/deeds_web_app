import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

const updateEvidenceSchema = z.object({
	title: z.string().trim().min(1).max(255).optional(),
	description: z.string().max(5000).optional(),
	type: z.string().max(100).optional(),
	evidenceNumber: z.string().max(50).optional(),
	source: z.string().max(255).optional(),
	summary: z.string().max(10000).optional(),
	tags: z.array(z.string()).optional(),
});

/**
 * GET /api/evidence/[id]
 * Retrieve a single evidence item by ID
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const [item] = await db
			.select()
			.from(evidence)
			.where(eq(evidence.id, params.id))
			.limit(1);

		if (!item) {
			return json({ error: 'Evidence not found' }, { status: 404 });
		}

		return json(item);
	} catch (err) {
		console.error('[evidence] GET error:', err);
		return json({ error: 'Failed to fetch evidence' }, { status: 500 });
	}
};

/**
 * PATCH /api/evidence/[id]
 * Update evidence metadata
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const parsed = updateEvidenceSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}

		const updates: Record<string, unknown> = {};
		const data = parsed.data;
		if (data.title !== undefined) updates.title = data.title;
		if (data.description !== undefined) updates.description = data.description;
		if (data.type !== undefined) updates.type = data.type;
		if (data.evidenceNumber !== undefined) updates.evidenceNumber = data.evidenceNumber;
		if (data.source !== undefined) updates.source = data.source;
		if (data.summary !== undefined) updates.summary = data.summary;
		if (data.tags !== undefined) updates.tags = data.tags;
		updates.updatedAt = sql`now()`;

		const [updated] = await db
			.update(evidence)
			.set(updates)
			.where(eq(evidence.id, params.id))
			.returning();

		if (!updated) {
			return json({ error: 'Evidence not found' }, { status: 404 });
		}

		return json(updated);
	} catch (err) {
		console.error('[evidence] PATCH error:', err);
		return json({ error: 'Failed to update evidence' }, { status: 500 });
	}
};

/**
 * DELETE /api/evidence/[id]
 * Delete an evidence item
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const [deleted] = await db
			.delete(evidence)
			.where(eq(evidence.id, params.id))
			.returning({ id: evidence.id, title: evidence.title });

		if (!deleted) {
			return json({ error: 'Evidence not found' }, { status: 404 });
		}

		return json({ success: true, deleted });
	} catch (err) {
		console.error('[evidence] DELETE error:', err);
		return json({ error: 'Failed to delete evidence' }, { status: 500 });
	}
};
