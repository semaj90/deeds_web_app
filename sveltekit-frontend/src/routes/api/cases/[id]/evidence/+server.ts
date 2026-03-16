import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { eq, desc, sql } from 'drizzle-orm';

/**
 * GET /api/cases/[id]/evidence
 * List all evidence items linked to a specific case
 */
export const GET: RequestHandler = async ({ params }) => {
	const caseId = params.id;

	try {
		const items = await db
			.select({
				id: evidence.id,
				caseId: evidence.caseId,
				title: evidence.title,
				description: evidence.description,
				type: evidence.type,
				evidenceType: evidence.evidenceType,
				fileName: evidence.fileName,
				fileType: evidence.fileType,
				fileSize: evidence.fileSize,
				mimeType: evidence.mimeType,
				fileUrl: evidence.fileUrl,
				evidenceNumber: evidence.evidenceNumber,
				source: evidence.source,
				summary: evidence.summary,
				tags: evidence.tags,
				aiTags: evidence.aiTags,
				collectedAt: evidence.collectedAt,
				collectedBy: evidence.collectedBy,
				createdAt: evidence.createdAt,
				updatedAt: evidence.updatedAt,
			})
			.from(evidence)
			.where(eq(evidence.caseId, caseId))
			.orderBy(desc(evidence.createdAt));

		const total = items.length;

		return json({ evidence: items, total });
	} catch (err) {
		console.error(`[cases/${caseId}/evidence] GET error:`, err);
		return json({ evidence: [], total: 0 });
	}
};