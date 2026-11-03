import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { and, eq, desc, or } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	await parent();
	const actorId = Number(locals.user?.id);
	if (!Number.isInteger(actorId) || actorId <= 0) throw error(401, 'Unauthorized');

	const [authorizedCase] = await db
		.select({ id: cases.id })
		.from(cases)
		.where(and(eq(cases.id, params.id), or(eq(cases.userId, actorId), eq(cases.assignedAttorney, actorId))))
		.limit(1);
	if (!authorizedCase) throw error(404, 'Case not found');

	const evidenceRows = await db
		.select()
		.from(evidence)
		.where(eq(evidence.caseId, params.id))
		.orderBy(desc(evidence.createdAt))
		.limit(100);

	return {
		evidenceRows: evidenceRows.map((ev) => ({
			id: ev.id,
			file_name: ev.fileName ?? null,
			evidence_type: ev.evidenceType ?? null,
			uploaded_at: ev.createdAt?.toISOString() ?? null,
			ai_summary: ev.aiSummary ?? null,
			ai_tags: (ev.aiTags as string[] | null) ?? [],
			tags: (ev.tags as string[] | null) ?? [],
			file_url: ev.fileUrl ?? null
		})),
		recentChat: []
	};
};
