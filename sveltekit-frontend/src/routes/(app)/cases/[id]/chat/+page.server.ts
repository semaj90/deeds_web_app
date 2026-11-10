import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, pgRows } from '$lib/server/db/client';
import { evidence, caseNotes } from '$lib/server/db/schema-postgres.js';
import { eq, desc, sql } from 'drizzle-orm';
import { getAuthorizedCase } from '$lib/server/case-access.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ locals, params }) => {
	// Lucia v3 Authentication Guard
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const caseId = params.id;
	if (!UUID_RE.test(caseId)) {
		return {
			caseData: null,
			evidenceList: [],
			documentsList: [],
			notesList: [],
			citationsList: [],
			loadError: 'Invalid case ID format'
		};
	}

	const actorId = Number(locals.user.id);
	if (!Number.isInteger(actorId) || actorId <= 0) throw error(404, 'Case not found');

	// Reuse the canonical owner/assigned-attorney rule before reading any case records.
	const caseRow = await getAuthorizedCase(caseId, actorId);
	if (!caseRow) throw error(404, 'Case not found');

	// Let query failures reach the route error state instead of presenting them as empty case data.
	const [evidenceRows, noteRows, citationResult] = await Promise.all([
		db.select().from(evidence).where(eq(evidence.caseId, caseId)).orderBy(desc(evidence.createdAt)),
		db.select().from(caseNotes).where(eq(caseNotes.caseId, caseId)).orderBy(desc(caseNotes.createdAt)),
		// The deployed documents table has no case_id column. Do not query it as
		// case-scoped or infer a case link from title/path; wait for an explicit join.
		// The live citations table matches the canonical migration fields. The wider
		// introspected citation shape is a different schema and caused this route's 500.
		// Keep this case-scoped projection small and avoid loading unrelated columns.
		db.execute(sql`
			SELECT id, case_id AS "caseId", document_id AS "documentId",
			       citation_text AS "citationText", source_url AS "sourceUrl",
			       page_number AS "pageNumber", confidence,
			       created_by AS "createdBy", created_at AS "createdAt",
			       updated_at AS "updatedAt"
			FROM public.citations
			WHERE case_id = ${caseId}
			ORDER BY created_at DESC
			LIMIT 100
		`)
	]);
	const citationRows = pgRows(await citationResult);

	return {
		caseData: caseRow,
		evidenceList: evidenceRows,
		documentsList: [],
		notesList: noteRows,
		citationsList: citationRows,
		loadError: null
	};
};
