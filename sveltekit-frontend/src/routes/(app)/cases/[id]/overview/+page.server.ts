import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { cases, evidence } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const caseId = params.id;

	const [caseRow] = await db
		.select()
		.from(cases)
		.where(eq(cases.id, caseId))
		.limit(1);

	if (!caseRow) {
		throw error(404, 'Case not found');
	}

	const evidenceRows = await db
		.select()
		.from(evidence)
		.where(eq(evidence.caseId, caseId))
		.limit(50);

	return {
		user: locals.user,
		caseId,
		caseData: {
			id: caseRow.id,
			title: caseRow.title,
			status: caseRow.status,
			description: caseRow.description,
			narrative: caseRow.description,
			who: caseRow.clientName ?? null,
			what: caseRow.description ?? null,
			when: caseRow.filingDate ?? null,
			where: caseRow.jurisdiction ?? null,
			why: null,
			how: null
		},
		evidence: evidenceRows.map((e) => ({
			id: e.id,
			label: e.title ?? e.fileName,
			filename: e.fileName,
			type: e.evidenceType ?? 'document',
			mimeType: e.fileType ?? 'unknown',
			status: 'indexed'
		})),
		persons: [] as Array<{ name: string; role: string; riskScore: string }>
	};
};
