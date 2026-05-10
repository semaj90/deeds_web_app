import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { cases, evidence, personsOfInterest } from '$lib/server/db/schema-postgres.js';
import { and, arrayContains, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { isUuid } from '$lib/server/validation.js';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

export const GET: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const id = params.id;
	if (!isUuid(id)) throw error(400, 'Invalid case ID format');

	const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

	const caseRows = await safe(
    db
      .select()
      .from(cases)
      .where(and(eq(cases.id, id), eq(cases.userId, Number(locals.user.id))))
      .limit(1),
    []
  );

	const caseRow = caseRows[0];

	if (!caseRow) {
		throw error(404, 'Case not found');
	}

	const [evidenceRows, personRows] = await Promise.all([
    safe(
      db
        .select()
        .from(evidence)
        .where(and(eq(evidence.caseId, id), eq(evidence.userId, locals.user.id)))
        .limit(50),
      []
    ),
    safe(
      db
        .select()
        .from(personsOfInterest)
        .where(arrayContains(personsOfInterest.caseIds, [id]))
        .limit(20),
      []
    ),
  ]);

	const whoParts: string[] = [];
	if (caseRow.clientName) whoParts.push(caseRow.clientName);
	if (caseRow.opposingParty) whoParts.push(`vs. ${caseRow.opposingParty}`);
	if (personRows.length) whoParts.push(`(${personRows.length} persons of interest)`);

	const responseData = {
		caseId: id,
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
		}))
	};
	const { etag, isMatch } = checkETag(responseData, request.headers);
	if (isMatch) return notModified(etag);
	return json(responseData, { headers: { ...cacheControl.private, ETag: etag } });
};
