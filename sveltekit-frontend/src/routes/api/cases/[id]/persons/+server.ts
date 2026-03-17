/**
 * GET/POST/DELETE /api/cases/[id]/persons
 * Manage persons of interest linked to a case via the case_persons junction.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { personsOfInterest, casePersons } from '$lib/server/db/schema/persons';
import { eq, and } from 'drizzle-orm';

/** GET — list all POI linked to a case with relationship metadata */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const caseId = params.id;

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

	const persons = rows.map(r => ({
		...r,
		isPrimary: r.isPrimary === 'true',
	}));

	return json({ persons, total: persons.length });
};

/** POST — link a person to a case */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const caseId = params.id;
	const body = await request.json();

	const { personId, relationshipType, isPrimary } = body as {
		personId: string;
		relationshipType?: string;
		isPrimary?: boolean;
	};

	if (!personId) return json({ error: 'personId required' }, { status: 400 });

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
	const body = await request.json();
	const { personId } = body as { personId: string };

	if (!personId) return json({ error: 'personId required' }, { status: 400 });

	await db.delete(casePersons).where(
		and(eq(casePersons.caseId, caseId), eq(casePersons.personId, personId))
	);

	return json({ success: true });
};