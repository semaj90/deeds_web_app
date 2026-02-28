import { citations, statutes, db } from '$lib/server/db/client';
import { error, json } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * POST /api/citations/export/json
 * Export citations as JSON file
 * Body: { citationIds?: string[], caseId?: string, includeStatutes?: boolean }
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const body = await request.json();
		const { citationIds, caseId, includeStatutes = true } = body;

		let citationsData: any[];

		// Fetch citations based on provided filters
		if (citationIds && citationIds.length > 0) {
			citationsData = await db
				.select()
				.from(citations)
				.where(inArray(citations.id, citationIds));
		} else if (caseId) {
			citationsData = await db
				.select()
				.from(citations)
				.where(eq(citations.caseId, caseId));
		} else {
			// Export all user's citations (limit to 1000 for safety)
			citationsData = await db.select().from(citations).limit(1000);
		}

		// Optionally include statute details
		let exportData: any = {
			exportDate: new Date().toISOString(),
			citationCount: citationsData.length,
			citations: citationsData.map((c) => ({
				id: c.id,
				citationText: c.citationText,
				caseId: c.caseId,
				sourceUrl: c.sourceUrl,
				createdAt: c.createdAt,
			})),
		};

		if (includeStatutes) {
			// Fetch related statutes (if citation text matches statute section)
			const statuteCodes = citationsData
				.map((c) => c.citationText)
				.filter(Boolean);

			if (statuteCodes.length > 0) {
				const statutesData = await db
					.select()
					.from(statutes)
					.where(inArray(statutes.section, statuteCodes));

				exportData.statutes = statutesData.map((s) => ({
					id: s.id,
					section: s.section,
					title: s.title,
					content: s.content,
					jurisdiction: s.jurisdiction,
					category: s.category,
				}));
			}
		}

		return json(exportData, {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="citations-export-${Date.now()}.json"`,
			},
		});
	} catch (err) {
		console.error('Error exporting citations as JSON:', err);
		throw error(500, 'Failed to export citations');
	}
};
