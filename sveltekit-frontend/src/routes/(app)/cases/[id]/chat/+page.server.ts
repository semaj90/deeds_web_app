import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { evidence, documents, caseNotes, citations } from '$lib/server/db/schema-postgres.js';
import { eq, desc } from 'drizzle-orm';
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
	const [evidenceRows, docRows, noteRows, citationRows] = await Promise.all([
		db.select().from(evidence).where(eq(evidence.caseId, caseId)).orderBy(desc(evidence.createdAt)),
		db.select().from(documents).where(eq(documents.caseId, caseId)).orderBy(desc(documents.createdAt)),
		db.select().from(caseNotes).where(eq(caseNotes.caseId, caseId)).orderBy(desc(caseNotes.createdAt)),
		db.select().from(citations).where(eq(citations.caseId, caseId))
	]);

	return {
		caseData: caseRow,
		evidenceList: evidenceRows,
		documentsList: docRows,
		notesList: noteRows,
		citationsList: citationRows,
		loadError: null
	};
};
