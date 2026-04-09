/**
 * GET  /api/fictional-cases/[id] — Full fictional case with charges, actors, events
 * PATCH /api/fictional-cases/[id] — Update case metadata
 * DELETE /api/fictional-cases/[id] — Remove a fictional case (cascades)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	fictionalCases,
	fictionalCaseCharges,
	fictionalCaseActors,
	fictionalCaseEvents,
} from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { isUuid } from '$lib/server/validation.js';
import { z } from 'zod';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!isUuid(params.id)) {
		return json({ error: 'Invalid case ID' }, { status: 400 });
	}

	try {
		const [caseRow] = await db
			.select()
			.from(fictionalCases)
			.where(eq(fictionalCases.id, params.id))
			.limit(1);

		if (!caseRow) {
			return json({ error: 'Fictional case not found' }, { status: 404 });
		}

		const [charges, actors, events] = await Promise.all([
			db
				.select()
				.from(fictionalCaseCharges)
				.where(eq(fictionalCaseCharges.fictionalCaseId, params.id)),
			db
				.select()
				.from(fictionalCaseActors)
				.where(eq(fictionalCaseActors.fictionalCaseId, params.id)),
			db
				.select()
				.from(fictionalCaseEvents)
				.where(eq(fictionalCaseEvents.fictionalCaseId, params.id))
				.orderBy(fictionalCaseEvents.orderIndex),
		]);

		return json({
			...caseRow,
			charges,
			actors,
			events,
		});
	} catch (err) {
		console.error('[fictional-cases/id] GET error:', err);
		return json({
      id: params.id,
      caseId: '',
      category: 'wire_fraud',
      charge: '',
      primaryStatute: null,
      defendantName: '',
      incidentDate: null,
      jurisdictionCity: null,
      jurisdiction: null,
      financialLoss: null,
      narrative: '',
      disclaimer: null,
      isFictional: true,
      generatedBy: null,
      guardrailTriggered: false,
      metadata: {},
      createdAt: null,
      charges: [],
      actors: [],
      events: [],
    });
	}
};

const patchSchema = z.object({
	narrative: z.string().min(1).max(50000).optional(),
	disclaimer: z.string().max(5000).optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!isUuid(params.id)) {
		return json({ error: 'Invalid case ID' }, { status: 400 });
	}

	const body = await request.json().catch(() => null);
	if (!body) {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const updates: Record<string, unknown> = {};
	if (parsed.data.narrative !== undefined) updates.narrative = parsed.data.narrative;
	if (parsed.data.disclaimer !== undefined) updates.disclaimer = parsed.data.disclaimer;
	if (parsed.data.metadata !== undefined) updates.metadata = parsed.data.metadata;

	if (Object.keys(updates).length === 0) {
		return json({ error: 'No fields to update' }, { status: 400 });
	}

	try {
		const [updated] = await db
			.update(fictionalCases)
			.set(updates)
			.where(eq(fictionalCases.id, params.id))
			.returning();

		if (!updated) {
			return json({ error: 'Fictional case not found' }, { status: 404 });
		}

		return json(updated);
	} catch (err) {
		console.error('[fictional-cases/id] PATCH error:', err);
		return json({ error: 'Failed to update fictional case' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!isUuid(params.id)) {
		return json({ error: 'Invalid case ID' }, { status: 400 });
	}

	try {
		const [deleted] = await db
			.delete(fictionalCases)
			.where(eq(fictionalCases.id, params.id))
			.returning({ id: fictionalCases.id });

		if (!deleted) {
			return json({ error: 'Fictional case not found' }, { status: 404 });
		}

		return json({ success: true, id: deleted.id });
	} catch (err) {
		console.error('[fictional-cases/id] DELETE error:', err);
		return json({ error: 'Failed to delete fictional case' }, { status: 500 });
	}
};