import { db } from '$lib/server/db/client';
import { citationCollections, collectionCitations, citations } from '$lib/server/db/schema-postgres.js';
import { error, json } from '@sveltejs/kit';
import { eq, and, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import {
	getCachedExport,
	cacheExport,
} from '$lib/server/cache/pdf-export-cache.js';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';

const collectionExportSchema = z.object({
	format: z.enum(['html', 'markdown', 'json']).optional().default('html')
});

/**
 * GET /api/citations/collections/[collectionId]/export?format=html|markdown|json
 * Export citation collection in various formats
 *
 * Caching: Exports are cached in Redis for 1 hour (Option #3)
 * - Cache HIT: ~5-10ms (90-98% faster)
 * - Cache MISS: ~100-500ms (generation + caching)
 * - Automatic invalidation via Priority #8 when collection is updated
 */

async function handleExport({ locals, params, format }: {
	locals: App.Locals;
	params: { collectionId: string };
	format: string;
}) {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}
	if (!isUuid(params.collectionId)) return json({ error: 'Invalid ID format' }, { status: 400 });

	const { collectionId } = params;

	// Fetch collection and verify ownership
	const [collection] = await db
		.select()
		.from(citationCollections)
		.where(
			and(
				eq(citationCollections.id, collectionId),
				eq(citationCollections.userId, locals.user.id)
			)
		)
		.limit(1);

	if (!collection) {
		throw error(404, 'Collection not found');
	}

	// Check cache first (Option #3: PDF Export Caching)
	const cached = await getCachedExport(collectionId, format, collection.updatedAt);
	if (cached) {
		console.log(`[Collection Export] Cache HIT: ${format} export for collection ${collectionId}`);

		// Return cached content
		return new Response(cached.content, {
			headers: {
				'Content-Type': cached.contentType,
				'Content-Disposition': `attachment; filename="${cached.filename}"`,
				'X-Cache-Status': 'HIT'
			}
		});
	}

	console.log(`[Collection Export] Cache MISS: Generating ${format} export for collection ${collectionId}`);

	// Fetch all citations in this collection
	// NOTE: citations Drizzle schema has column name mismatches vs actual DB:
	//   citationText→quoted_text, sourceUrl→N/A, confidence→relevance_score
	// Use Drizzle for type-safe joins + sql`` for actual DB column names
	const collectionCitationsList = await db
		.select({
			citationId: citations.id,
			pageNumber: citations.pageNumber,
			createdAt: citations.createdAt,
			addedAt: collectionCitations.addedAt,
			// Actual DB column names (Drizzle schema mismatch)
			quotedText: sql<string>`"citations"."quoted_text"`,
			citationType: sql<string>`"citations"."citation_type"`,
			relevanceScore: sql<number>`"citations"."relevance_score"`,
			formattedCitation: sql<string>`"citations"."formatted_citation"`,
			isKeyAuthority: sql<boolean>`"citations"."is_key_authority"`,
		})
		.from(collectionCitations)
		.innerJoin(citations, eq(collectionCitations.citationId, citations.id))
		.where(eq(collectionCitations.collectionId, collectionId))
		.orderBy(collectionCitations.addedAt);

	// Generate export based on format
	switch (format) {
		case 'html': {
			const content = generateCollectionHTML(collection, collectionCitationsList);
			const contentType = 'text/html';
			const filename = `${sanitizeFilename(collection.name)}-collection.html`;

			// Cache the generated export (Option #3)
			await cacheExport(collectionId, format, content, contentType, filename, collection.updatedAt);

			return new Response(content, {
				headers: {
					'Content-Type': contentType,
					'Content-Disposition': `attachment; filename="${filename}"`,
					'X-Cache-Status': 'MISS'
				}
			});
		}

		case 'markdown': {
			const content = generateCollectionMarkdown(collection, collectionCitationsList);
			const contentType = 'text/markdown';
			const filename = `${sanitizeFilename(collection.name)}-collection.md`;

			// Cache the generated export (Option #3)
			await cacheExport(collectionId, format, content, contentType, filename, collection.updatedAt);

			return new Response(content, {
				headers: {
					'Content-Type': contentType,
					'Content-Disposition': `attachment; filename="${filename}"`,
					'X-Cache-Status': 'MISS'
				}
			});
		}

		case 'json': {
			const content = JSON.stringify(
				{
					collection: {
						id: collection.id,
						name: collection.name,
						description: collection.description,
						color: collection.color,
						isPublic: collection.isPublic,
						createdAt: collection.createdAt,
						updatedAt: collection.updatedAt,
					},
					citations: collectionCitationsList.map(c => ({
						id: c.citationId,
						text: c.quotedText,
						citationType: c.citationType,
						formattedCitation: c.formattedCitation,
						pageNumber: c.pageNumber,
						relevanceScore: c.relevanceScore,
						isKeyAuthority: c.isKeyAuthority,
						createdAt: c.createdAt,
						addedToCollectionAt: c.addedAt,
					})),
					totalCitations: collectionCitationsList.length,
					exportedAt: new Date().toISOString(),
				},
				null,
				2
			);
			const contentType = 'application/json';
			const filename = `${sanitizeFilename(collection.name)}-collection.json`;

			// Cache the generated export (Option #3)
			await cacheExport(collectionId, format, content, contentType, filename, collection.updatedAt);

			return new Response(content, {
				headers: {
					'Content-Type': contentType,
					'Content-Disposition': `attachment; filename="${filename}"`,
					'X-Cache-Status': 'MISS'
				}
			});
		}

		default:
			throw error(400, 'Invalid format. Supported: html, markdown, json');
	}
}

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const format = url.searchParams.get('format') || 'html';
	return handleExport({ locals, params, format });
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const raw = await request.json();
	const parsed = collectionExportSchema.safeParse(raw);
	const format = parsed.success ? parsed.data.format : 'html';
	return handleExport({ locals, params, format });
};

// ===== HELPER FUNCTIONS =====

function sanitizeFilename(name: string): string {
	return name.replace(/[^a-z0-9\-_]/gi, '-').toLowerCase();
}

function generateCollectionHTML(collection: any, citationsList: any[]): string {
	const citationRows = citationsList.map((c, i) => `
		<tr>
			<td style="padding: 8px; border: 1px solid #ddd;">${i + 1}</td>
			<td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(c.quotedText || c.formattedCitation || 'N/A')}</td>
			<td style="padding: 8px; border: 1px solid #ddd;">${c.citationType || 'N/A'}</td>
			<td style="padding: 8px; border: 1px solid #ddd;">${c.pageNumber || 'N/A'}</td>
			<td style="padding: 8px; border: 1px solid #ddd;">${c.relevanceScore ? (Number(c.relevanceScore) * 100).toFixed(1) + '%' : 'N/A'}</td>
		</tr>
	`).join('');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(collection.name)} - Citation Collection</title>
	<style>
		body { font-family: 'Times New Roman', serif; max-width: 1200px; margin: 40px auto; padding: 20px; line-height: 1.6; }
		h1 { color: ${collection.color || '#8B2332'}; border-bottom: 3px solid ${collection.color || '#8B2332'}; padding-bottom: 10px; }
		.meta { color: #666; font-size: 0.9em; margin-bottom: 20px; }
		table { width: 100%; border-collapse: collapse; margin-top: 20px; }
		th { background-color: ${collection.color || '#8B2332'}; color: white; padding: 12px; text-align: left; }
		tr:nth-child(even) { background-color: #f9f9f9; }
		.footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 0.85em; color: #666; }
	</style>
</head>
<body>
	<h1>${escapeHtml(collection.name)}</h1>
	<div class="meta">
		${collection.description ? `<p><strong>Description:</strong> ${escapeHtml(collection.description)}</p>` : ''}
		<p><strong>Total Citations:</strong> ${citationsList.length}</p>
		<p><strong>Created:</strong> ${new Date(collection.createdAt).toLocaleDateString()}</p>
		<p><strong>Last Updated:</strong> ${new Date(collection.updatedAt).toLocaleDateString()}</p>
		<p><strong>Exported:</strong> ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
	</div>

	<table>
		<thead>
			<tr>
				<th>#</th>
				<th>Citation Text</th>
				<th>Type</th>
				<th>Page</th>
				<th>Confidence</th>
			</tr>
		</thead>
		<tbody>
			${citationRows}
		</tbody>
	</table>

	<div class="footer">
		<p>Generated by Legal AI Platform - Citation Management System</p>
		<p>${citationsList.length} citation${citationsList.length !== 1 ? 's' : ''} exported from collection "${escapeHtml(collection.name)}"</p>
	</div>
</body>
</html>`;
}

function generateCollectionMarkdown(collection: any, citationsList: any[]): string {
	const citationRows = citationsList.map((c, i) => {
		const text = c.quotedText || c.formattedCitation || 'N/A';
		return `${i + 1}. **${text}**\n   - Type: ${c.citationType || 'N/A'}\n   - Page: ${c.pageNumber || 'N/A'}\n   - Relevance: ${c.relevanceScore ? (Number(c.relevanceScore) * 100).toFixed(1) + '%' : 'N/A'}\n`;
	}).join('\n');

	return `# ${collection.name}

${collection.description || ''}

**Total Citations:** ${citationsList.length}
**Created:** ${new Date(collection.createdAt).toLocaleDateString()}
**Last Updated:** ${new Date(collection.updatedAt).toLocaleDateString()}
**Exported:** ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}

---

## Citations

${citationRows}

---

*Generated by Legal AI Platform - Citation Management System*
`;
}

function escapeHtml(text: string): string {
	const map: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;'
	};
	return text.replace(/[&<>"']/g, m => map[m]);
}
