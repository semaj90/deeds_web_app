import { citations, statutes, db } from '$lib/server/db/client';
import { error } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * POST /api/citations/export/pdf
 * Export citations as formatted text (PDF-like)
 * Body: { citationIds?: string[], caseId?: string, includeStatutes?: boolean }
 *
 * Note: Returns formatted text with PDF-appropriate headers for download
 * For full PDF generation, a library like PDFKit would be needed
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

		// Build formatted text document
		const lines: string[] = [];
		lines.push('CITATION LIBRARY EXPORT');
		lines.push('='.repeat(80));
		lines.push(`Export Date: ${new Date().toLocaleString()}`);
		lines.push(`Total Citations: ${citationsData.length}`);
		lines.push('='.repeat(80));
		lines.push('');

		// Add each citation
		for (let i = 0; i < citationsData.length; i++) {
			const citation = citationsData[i];
			lines.push(`CITATION ${i + 1}`);
			lines.push('-'.repeat(80));
			lines.push(`Text: ${citation.citationText || 'N/A'}`);
			lines.push(`Case ID: ${citation.caseId || 'N/A'}`);
			lines.push(`Source URL: ${citation.sourceUrl || 'N/A'}`);
			lines.push(`Created: ${citation.createdAt ? new Date(citation.createdAt).toLocaleString() : 'N/A'}`);

			// Include statute details if enabled
			if (includeStatutes && citation.citationText) {
				const [statuteData] = await db
					.select()
					.from(statutes)
					.where(eq(statutes.section, citation.citationText))
					.limit(1);

				if (statuteData) {
					lines.push('');
					lines.push('STATUTE DETAILS:');
					lines.push(`  Title: ${statuteData.title || 'N/A'}`);
					lines.push(`  Section: ${statuteData.section || 'N/A'}`);
					lines.push(`  Jurisdiction: ${statuteData.jurisdiction || 'N/A'}`);
					lines.push(`  Category: ${statuteData.category || 'N/A'}`);
					if (statuteData.content) {
						lines.push(`  Content: ${statuteData.content.slice(0, 200)}${statuteData.content.length > 200 ? '...' : ''}`);
					}
				}
			}

			lines.push('');
			lines.push('');
		}

		lines.push('='.repeat(80));
		lines.push('END OF REPORT');

		const textContent = lines.join('\n');

		return new Response(textContent, {
			status: 200,
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Content-Disposition': `attachment; filename="citations-export-${Date.now()}.txt"`,
			},
		});
	} catch (err) {
		console.error('Error exporting citations as PDF:', err);
		throw error(500, 'Failed to export citations');
	}
};