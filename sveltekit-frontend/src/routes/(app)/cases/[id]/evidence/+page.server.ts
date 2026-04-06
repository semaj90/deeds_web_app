import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();

	const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

	const evidenceRows = await safe(
		db
			.select()
			.from(evidence)
			.where(eq(evidence.caseId, params.id))
			.orderBy(desc(evidence.createdAt))
			.limit(100),
		[]
	);

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