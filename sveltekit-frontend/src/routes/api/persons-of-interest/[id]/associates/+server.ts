import { db } from '$lib/server/db/client';
import { personsOfInterest } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { eq, ne, and, sql, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { isUuid } from '$lib/server/validation.js';

/**
 * GET /api/persons-of-interest/[id]/associates
 * Returns persons who share cases with the target person (implicit associates).
 * No separate join table needed — derives from shared caseIds arrays.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!isUuid(params.id)) return json({ error: 'Invalid ID format' }, { status: 400 });
	const poiId = params.id;

	try {
		const [target] = await db
      .select({ caseIds: personsOfInterest.caseIds })
      .from(personsOfInterest)
      .where(and(eq(personsOfInterest.id, poiId), eq(personsOfInterest.createdBy, locals.user.id)))
      .limit(1);

    if (!target || !target.caseIds?.length) {
      return json({ associates: [] });
    }

    // PostgreSQL array overlap (&&) with parameterized array
    const caseArray = target.caseIds;
    const associates = await db
      .select()
      .from(personsOfInterest)
      .where(
        and(
          ne(personsOfInterest.id, poiId),
          eq(personsOfInterest.createdBy, locals.user.id),
          sql`${personsOfInterest.caseIds} && ${caseArray}::text[]`
        )
      )
      .limit(20);

		return json({
			associates: associates.map((a) => ({
				id: `assoc_${poiId}_${a.id}`,
				poiId,
				associateId: a.id,
				relationshipType: a.relationship ?? 'unknown',
				notes: null,
				createdAt: a.createdAt?.toISOString?.() ?? new Date().toISOString(),
				associate: {
					id: a.id,
					name: a.name,
					status: a.status ?? 'active',
					threatLevel: a.threatLevel ?? 'low',
					description: a.description
				}
			}))
		});
	} catch (err) {
		console.error('Failed to load associates:', err);
		return json({ associates: [] });
	}
};
