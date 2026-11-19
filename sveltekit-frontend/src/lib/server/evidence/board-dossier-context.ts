import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { personsOfInterest, reports } from '$lib/server/db/schema-postgres.js';
import { casePersons } from '$lib/server/db/schema/persons.js';
import type { BoardDossierContext } from '$lib/components/evidence/board-dossier-context.js';

const PREVIEW_LIMIT = 12;

/** Caller must authorize the case before requesting its board context. */
export async function loadBoardDossierContext(caseId: string, actorId: number): Promise<BoardDossierContext> {
	const [caseReports, people] = await Promise.allSettled([
		db.select({ id: reports.id, title: reports.title, status: reports.status, type: sql<string | null>`coalesce(${reports.reportType}, ${reports.type})` })
			.from(reports).where(eq(reports.caseId, caseId))
			.orderBy(desc(reports.createdAt), reports.id).limit(PREVIEW_LIMIT),
		db.select({
			id: personsOfInterest.id, name: personsOfInterest.name, status: personsOfInterest.status,
			role: sql<string | null>`coalesce(${casePersons.relationshipType}, ${personsOfInterest.relationship})`,
		}).from(personsOfInterest)
			.leftJoin(casePersons, and(eq(casePersons.personId, personsOfInterest.id), eq(casePersons.caseId, caseId)))
			.where(or(
				eq(casePersons.caseId, caseId),
				and(or(eq(personsOfInterest.createdBy, actorId), isNull(personsOfInterest.createdBy)), or(
					eq(personsOfInterest.caseId, caseId),
					sql`${personsOfInterest.caseIds} @> array[${caseId}]::text[]`,
				)),
			))
			.orderBy(personsOfInterest.name, personsOfInterest.id).limit(PREVIEW_LIMIT),
	]);
	const unavailable: BoardDossierContext['unavailable'] = [];
	if (caseReports.status === 'rejected') unavailable.push('reports');
	if (people.status === 'rejected') unavailable.push('people');
	return {
		reports: caseReports.status === 'fulfilled' ? caseReports.value : [],
		people: people.status === 'fulfilled' ? people.value : [],
		unavailable,
	};
}
