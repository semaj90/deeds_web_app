import { db } from '$lib/server/db/client';
import { personsOfInterest } from '$lib/db/schema';
import { json } from '@sveltejs/kit';
import { eq, ne, and, sql, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * GET /api/persons-of-interest/[id]/associates
 * Returns persons who share cases with the target person (implicit associates).
 * No separate join table needed — derives from shared caseIds arrays.
 */
export const GET: RequestHandler = async ({ params }) => {
	const poiId = params.id;

	try {
		const [target] = await db
			.select({ caseIds: personsOfInterest.caseIds })
			.from(personsOfInterest)
			.where(eq(personsOfInterest.id, poiId))
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
