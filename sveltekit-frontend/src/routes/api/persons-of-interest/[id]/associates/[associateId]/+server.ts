import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { auditLog } from '$lib/server/db/schema-postgres.js';

/**
 * DELETE /api/persons-of-interest/[id]/associates/[associateId]
 *
 * Associates are implicit (derived from shared caseIds via array overlap).
 * No join table exists, so this logs a dissociation audit record and
 * returns 200 so the frontend can filter the associate from its local list.
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const { id: poiId, associateId } = params;

	try {
		await db.insert(auditLog).values({
			userId: locals.user.id,
			action: 'poi_dissociate',
			resourceType: 'person_of_interest',
			resourceId: poiId,
			details: { dissociatedFrom: associateId },
		});
	} catch (err) {
		// Non-fatal — audit log failure shouldn't block the dissociation
		console.error('Audit log insert failed:', err);
	}

	return json({ success: true, poiId, dissociatedFrom: associateId });
};
