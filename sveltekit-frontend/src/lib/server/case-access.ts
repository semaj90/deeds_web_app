import { and, eq, or } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema-postgres.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Canonical case page/API access rule: case owner or assigned attorney. */
export async function getAuthorizedCase(caseId: string, actorId: number) {
	if (!UUID_RE.test(caseId) || !Number.isSafeInteger(actorId) || actorId <= 0) return null;
	const [row] = await db
		.select()
		.from(cases)
		.where(
			and(
				eq(cases.id, caseId),
				or(eq(cases.userId, actorId), eq(cases.assignedAttorney, actorId))
			)
		)
		.limit(1);
	return row ?? null;
}
