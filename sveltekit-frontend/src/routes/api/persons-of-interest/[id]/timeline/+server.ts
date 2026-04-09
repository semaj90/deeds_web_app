import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { personsOfInterest, timelineEvents } from '$lib/server/db/schema-postgres.js';
import { and, eq, desc, isNull, or } from 'drizzle-orm';
import { z } from 'zod';

const poiIdSchema = z.string().uuid('Invalid POI id');

const createTimelineSchema = z.object({
	title: z.string().trim().min(1, 'Title is required').max(500),
	description: z.string().max(5000).optional(),
	eventDate: z.string().datetime({ offset: true }).or(z.string().min(1)),
	eventType: z.enum(['general', 'arrest', 'court', 'sighting', 'evidence', 'contact', 'incident', 'note']).default('general'),
	location: z.string().max(500).optional(),
	severity: z.enum(['low', 'medium', 'high', 'critical']).default('low'),
});

/**
 * GET /api/persons-of-interest/[id]/timeline
 * List timeline events for a POI, ordered by event date descending
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsedId = poiIdSchema.safeParse(params.id);
	if (!parsedId.success) {
		return json({ error: 'Invalid POI id' }, { status: 400 });
	}

	try {
		const [poi] = await db
      .select({ id: personsOfInterest.id })
      .from(personsOfInterest)
      .where(
        and(
          eq(personsOfInterest.id, parsedId.data),
          or(eq(personsOfInterest.createdBy, locals.user.id), isNull(personsOfInterest.createdBy))
        )
      )
      .limit(1);

    if (!poi) {
      return json({ events: [] });
    }

		const events = await db
			.select()
			.from(timelineEvents)
			.where(eq(timelineEvents.poiId, parsedId.data))
			.orderBy(desc(timelineEvents.eventDate));

		return json({
			events: events.map((e) => ({
				...e,
				eventDate: e.eventDate?.toISOString() ?? '',
				createdAt: e.createdAt?.toISOString() ?? '',
				updatedAt: e.updatedAt?.toISOString() ?? '',
			})),
		});
	} catch (err) {
		console.error('[timeline] GET error:', err);
		return json({ events: [] });
	}
};

/**
 * POST /api/persons-of-interest/[id]/timeline
 * Create a new timeline event for a POI
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsedId = poiIdSchema.safeParse(params.id);
	if (!parsedId.success) {
		return json({ error: 'Invalid POI id' }, { status: 400 });
	}

	try {
		const [poi] = await db
      .select({ id: personsOfInterest.id })
      .from(personsOfInterest)
      .where(
        and(
          eq(personsOfInterest.id, parsedId.data),
          or(eq(personsOfInterest.createdBy, locals.user.id), isNull(personsOfInterest.createdBy))
        )
      )
      .limit(1);

    if (!poi) {
      return json({ error: 'Person of interest not found' }, { status: 404 });
    }

		const body = await request.json().catch(() => ({}));
		const parsed = createTimelineSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}

		const [created] = await db
			.insert(timelineEvents)
			.values({
				poiId: parsedId.data,
				title: parsed.data.title,
				description: parsed.data.description ?? null,
				eventDate: new Date(parsed.data.eventDate),
				eventType: parsed.data.eventType,
				location: parsed.data.location ?? null,
				severity: parsed.data.severity,
				createdBy: locals.user?.id ?? null,
			})
			.returning();

		return json(
			{
				...created,
				eventDate: created.eventDate?.toISOString() ?? '',
				createdAt: created.createdAt?.toISOString() ?? '',
				updatedAt: created.updatedAt?.toISOString() ?? '',
			},
			{ status: 201 }
		);
	} catch (err) {
		console.error('[timeline] POST error:', err);
		return json({ error: 'Failed to create timeline event' }, { status: 500 });
	}
};
