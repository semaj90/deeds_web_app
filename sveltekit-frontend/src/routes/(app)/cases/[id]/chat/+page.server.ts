import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { cases, evidence, documents, caseNotes, citations } from '$lib/server/db/schema-postgres.js';
import { eq, desc } from 'drizzle-orm';

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

	const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

	const [caseRow] = await safe(db.select().from(cases).where(eq(cases.id, caseId)).limit(1), [null]);
	const evidenceRows = await safe(
		db.select().from(evidence).where(eq(evidence.caseId, caseId)).orderBy(desc(evidence.createdAt)),
		[]
	);
	const docRows = await safe(
		db.select().from(documents).where(eq(documents.caseId, caseId)).orderBy(desc(documents.createdAt)),
		[]
	);
	const noteRows = await safe(
		db.select().from(caseNotes).where(eq(caseNotes.caseId, caseId)).orderBy(desc(caseNotes.createdAt)),
		[]
	);
	const citationRows = await safe(
		db.select().from(citations).where(eq(citations.caseId, caseId)),
		[]
	);

	return {
		caseData: caseRow,
		evidenceList: evidenceRows,
		documentsList: docRows,
		notesList: noteRows,
		citationsList: citationRows,
		loadError: caseRow ? null : 'Case not found in PostgreSQL 18'
	};
};
