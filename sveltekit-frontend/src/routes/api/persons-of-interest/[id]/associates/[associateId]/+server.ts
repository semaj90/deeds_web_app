import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './';
import { db } from '$lib/server/db/client';
import { auditLog, personsOfInterest } from '$lib/server/db/schema-postgres.js';
import { and, eq, or, isNull } from 'drizzle-orm';
import { validateUuidParams } from '$lib/server/validation.js';

/**
 * DELETE /api/persons-of-interest/[id]/associates/[associateId]
 *
 * Associates are implicit (derived from shared caseIds via array overlap).
 * No join table exists, so this logs a dissociation audit record and
 * returns 200 so the frontend can filter the associate from its local list.
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  const invalid = validateUuidParams(params, 'id', 'associateId');
  if (invalid) return invalid;

  const { id: poiId, associateId } = params;

  try {
    const [poi] = await db
      .select({ id: personsOfInterest.id })
      .from(personsOfInterest)
      .where(and(eq(personsOfInterest.id, poiId), or(eq(personsOfInterest.createdBy, locals.user.id), isNull(personsOfInterest.createdBy))))
      .limit(1);

    if (!poi) {
      return json({ error: 'Person of interest not found' }, { status: 404 });
    }

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
