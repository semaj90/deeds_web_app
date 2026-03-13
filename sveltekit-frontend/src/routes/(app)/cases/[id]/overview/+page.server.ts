import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { cases, evidence, personsOfInterest } from '$lib/server/db/schema-postgres.js';
import { arrayContains, eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const caseId = params.id;
	const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

	const caseRows = await safe(
		db.select().from(cases).where(eq(cases.id, caseId)).limit(1),
		[]
	);

	const caseRow = caseRows[0];

	if (!caseRow) {
		return {
			user: locals.user,
			caseId,
			caseData: null,
			evidence: [],
			persons: [] as Array<{ id: string; name: string; role: string; riskScore: string; aiSummary: string | null }>,
			loadError: 'Case not found or database unavailable'
		};
	}

	const [evidenceRows, personRows] = await Promise.all([
		safe(
			db.select().from(evidence).where(eq(evidence.caseId, caseId)).limit(50),
			[]
		),
		safe(
			db.select().from(personsOfInterest)
				.where(arrayContains(personsOfInterest.caseIds, [caseId]))
				.limit(20),
			[]
		)
	]);

	// Build WHO from client + opposing party + linked persons
	const whoParts: string[] = [];
	if (caseRow.clientName) whoParts.push(caseRow.clientName);
	if (caseRow.opposingParty) whoParts.push(`vs. ${caseRow.opposingParty}`);
	if (personRows.length) whoParts.push(`(${personRows.length} persons of interest)`);

	return {
		user: locals.user,
		caseId,
		caseData: {
			id: caseRow.id,
			title: caseRow.title,
			status: caseRow.status,
			description: caseRow.description,
			narrative: caseRow.description,
			who: whoParts.length ? whoParts.join(' ') : null,
			what: caseRow.description ?? null,
			when: caseRow.filingDate ?? null,
			where: caseRow.jurisdiction ? `${caseRow.jurisdiction}${caseRow.court ? ` — ${caseRow.court}` : ''}` : null,
			why: caseRow.practiceArea ? `Practice area: ${caseRow.practiceArea}` : null,
			how: evidenceRows.length ? `${evidenceRows.length} evidence items attached` : null
		},
		evidence: evidenceRows.map((e) => ({
			id: e.id,
			label: e.title ?? e.fileName,
			filename: e.fileName,
			type: e.evidenceType ?? 'document',
			mimeType: e.fileType ?? 'unknown',
			status: 'indexed',
			keyPoints: ((e.aiAnalysis as Record<string, unknown> | null)?.keyPoints as string[]) ?? []
		})),
		persons: personRows.map((p) => ({
			id: p.id,
			name: p.name ?? 'Unknown',
			role: p.status ?? 'Person of interest',
			riskScore: p.threatLevel ?? '—',
			aiSummary: ((p.aiProfile as Record<string, unknown> | null)?.summary as string) ?? null
		})),
		loadError: null
	};
};
