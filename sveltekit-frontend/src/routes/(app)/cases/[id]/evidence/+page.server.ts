import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { eq, desc } from 'drizzle-orm';
import { getAuthorizedCase } from '$lib/server/case-access.js';

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	await parent();
	const actorId = Number(locals.user?.id);
	if (!Number.isInteger(actorId) || actorId <= 0) throw error(401, 'Unauthorized');

	const authorizedCase = await getAuthorizedCase(params.id, actorId);
	if (!authorizedCase) throw error(404, 'Case not found');

	let evidenceRows: (typeof evidence.$inferSelect)[] = [];
	let loadError: string | null = null;
	try {
		evidenceRows = await db
			.select()
			.from(evidence)
			.where(eq(evidence.caseId, params.id))
			.orderBy(desc(evidence.createdAt))
			.limit(100);
	} catch {
		loadError = 'Could not load this case’s evidence. Try again in a moment.';
	}

	return {
		evidenceRows: evidenceRows.map((ev) => ({
			id: ev.id,
			file_name: ev.fileName ?? null,
			evidence_type: ev.evidenceType ?? null,
			uploaded_at: ev.createdAt?.toISOString() ?? null,
			ai_summary: ev.aiSummary ?? null,
			ai_tags: (ev.aiTags as string[] | null) ?? [],
			tags: (ev.tags as string[] | null) ?? [],
			hasFile: Boolean(ev.fileUrl)
		})),
		recentChat: [],
		loadError
	};
};
