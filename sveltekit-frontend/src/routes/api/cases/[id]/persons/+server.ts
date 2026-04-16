/**
 * GET/POST/DELETE /api/cases/[id]/persons
 * Manage persons of interest linked to a case via the case_persons junction.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { personsOfInterest, casePersons } from '$lib/server/db/schema/persons';
import { cases } from '$lib/server/db/schema-postgres.js';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const personLinkSchema = z.object({
  personId: z.string().uuid(),
  relationshipType: z.string().max(100).optional(),
  isPrimary: z.boolean().optional(),
});

const personDeleteSchema = z.object({
  personId: z.string().uuid(),
});

import { isUuid } from '$lib/server/validation.js';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

/** GET — list all POI linked to a case with relationship metadata */
export const GET: RequestHandler = async ({ params, locals, request }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!isUuid(params.id)) return json({ error: 'Invalid case ID format' }, { status: 400 });

  const caseId = params.id;

  try {
    const [targetCase] = await db
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.id, caseId), eq(cases.userId, locals.user.id)))
      .limit(1);

    if (!targetCase) return json({ error: 'Case not found' }, { status: 404 });

    const rows = await db
      .select({
        linkId: casePersons.id,
        personId: personsOfInterest.id,
        fullName: personsOfInterest.fullName,
        role: personsOfInterest.role,
        riskLevel: personsOfInterest.riskLevel,
        dob: personsOfInterest.dob,
        lastKnownLocation: personsOfInterest.lastKnownLocation,
        notes: personsOfInterest.notes,
        relationshipType: casePersons.relationshipType,
        isPrimary: casePersons.isPrimary,
        linkedAt: casePersons.createdAt,
      })
      .from(casePersons)
      .innerJoin(personsOfInterest, eq(casePersons.personId, personsOfInterest.id))
      .where(eq(casePersons.caseId, caseId));

    const persons = rows.map((r) => ({
      ...r,
      isPrimary: r.isPrimary === 'true',
    }));

    const responseData = { persons, total: persons.length };
    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);
    return json(responseData, { headers: { ...cacheControl.private, ETag: etag } });
  } catch (err) {
    console.error('[cases/[id]/persons] GET error:', err);
    return json({ persons: [], total: 0 });
  }
};

/** POST — link a person to a case */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const caseId = params.id;
	const [targetCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.userId, locals.user.id)))
    .limit(1);

  if (!targetCase) return json({ error: 'Case not found' }, { status: 404 });

	const raw = await request.json().catch(() => ({}));
  const parsed = personLinkSchema.safeParse(raw);
  if (!parsed.success)
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  const { personId, relationshipType, isPrimary } = parsed.data;

	const [link] = await db.insert(casePersons).values({
		caseId,
		personId,
		relationshipType: relationshipType || 'other',
		isPrimary: isPrimary ? 'true' : 'false',
	}).returning({ id: casePersons.id });

	return json({ id: link.id, success: true }, { status: 201 });
};

/** DELETE — unlink a person from a case */
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const caseId = params.id;
	const [targetCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.userId, locals.user.id)))
    .limit(1);

  if (!targetCase) return json({ error: 'Case not found' }, { status: 404 });

	const raw = await request.json().catch(() => ({}));
  const parsed = personDeleteSchema.safeParse(raw);
  if (!parsed.success)
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  const { personId } = parsed.data;

	await db.delete(casePersons).where(
		and(eq(casePersons.caseId, caseId), eq(casePersons.personId, personId))
	);

	return json({ success: true });
};