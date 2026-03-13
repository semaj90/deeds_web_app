import { db } from '$lib/server/db/client';
import { reports } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { auditReportAction } from '$lib/server/reports/audit.js';
import {
	getCachedExport,
	cacheExport,
	type CachedExport
} from '$lib/server/cache/pdf-export-cache.js';
import { z } from 'zod';

const reportExportSchema = z.object({
	format: z.enum(['html', 'markdown', 'json', 'pdf', 'docx']).optional().default('html')
});

/**
 * GET /api/reports/[id]/export?format=pdf|html|markdown|json
 * POST /api/reports/[id]/export with { format: 'pdf' | 'html' | 'markdown' | 'json' }
 * Export report in various formats
 *
 * Caching: Exports are cached in Redis for 1 hour (Option #3)
 * - Cache HIT: ~5-10ms (90-98% faster)
 * - Cache MISS: ~100-500ms (generation + caching)
 * - Automatic invalidation via Priority #8 when report content changes
 */

async function handleExport({ locals, params, format, request }: {
	locals: App.Locals;
	params: { id: string };
	format: string;
	request?: Request;
}) {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const reportId = params.id;

	// Fetch report and verify ownership
	const [report] = await db
		.select()
		.from(reports)
		.where(
			and(
				eq(reports.id, reportId),
				eq(reports.createdBy, locals.user.id)
			)
		)
		.limit(1);

	if (!report) {
		throw error(404, 'Report not found');
	}

	// Check cache first (Option #3: PDF Export Caching)
	const cached = await getCachedExport(reportId, format, report.updatedAt);
	if (cached) {
		console.log(`[Export] Cache HIT: ${format} export for report ${reportId}`);

		// Audit log: report exported (from cache)
		await auditReportAction({
			reportId: report.id,
			userId: locals.user.id,
			action: 'exported',
			changes: { format, cached: true },
			request,
		}).catch(err => console.warn('[Export] Audit log failed:', err));

		// Return cached content
		return new Response(cached.content, {
			headers: {
				'Content-Type': cached.contentType,
				'Content-Disposition': `attachment; filename="${cached.filename}"`,
				'X-Cache-Status': 'HIT'
			}
		});
	}

	console.log(`[Export] Cache MISS: Generating ${format} export for report ${reportId}`);

	// Audit log: report exported (generating new)
	await auditReportAction({
		reportId: report.id,
		userId: locals.user.id,
		action: 'exported',
		changes: { format, cached: false },
		request,
	}).catch(err => console.warn('[Export] Audit log failed:', err));

	// Generate export based on format
	switch (format) {
		case 'html': {
			const content = generateHTML(report);
			const contentType = 'text/html';
			const filename = `${sanitizeFilename(report.title)}.html`;

			// Cache the generated export (Option #3)
			await cacheExport(reportId, format, content, contentType, filename, report.updatedAt);

			return new Response(content, {
				headers: {
					'Content-Type': contentType,
					'Content-Disposition': `attachment; filename="${filename}"`,
					'X-Cache-Status': 'MISS'
				}
			});
		}

		case 'markdown': {
			const content = htmlToMarkdown(report.content || '');
			const contentType = 'text/markdown';
			const filename = `${sanitizeFilename(report.title)}.md`;

			// Cache the generated export (Option #3)
			await cacheExport(reportId, format, content, contentType, filename, report.updatedAt);

			return new Response(content, {
				headers: {
					'Content-Type': contentType,
					'Content-Disposition': `attachment; filename="${filename}"`,
					'X-Cache-Status': 'MISS'
				}
			});
		}

		case 'pdf':
			// PDF generation requires puppeteer or jspdf
			// For now, return error with instructions
			return json(
				{
					error: 'PDF export requires additional setup',
					instructions: 'Install puppeteer or use the HTML export and print to PDF',
					fallback: `/api/reports/${reportId}/export?format=html`
				},
				{ status: 501 }
			);

		case 'docx':
			// DOCX export not yet implemented
			return json(
				{
					error: 'DOCX export not yet implemented',
					instructions: 'Use HTML or Markdown export as a workaround',
					fallback: `/api/reports/${reportId}/export?format=html`
				},
				{ status: 501 }
			);

		case 'json': {
			const content = JSON.stringify(
				{
					id: report.id,
					title: report.title,
					type: report.status,
					content: report.content,
					metadata: report.metadata,
					createdAt: report.createdAt,
					updatedAt: report.updatedAt
				},
				null,
				2
			);
			const contentType = 'application/json';
			const filename = `${sanitizeFilename(report.title)}.json`;

			// Cache the generated export (Option #3)
			await cacheExport(reportId, format, content, contentType, filename, report.updatedAt);

			return new Response(content, {
				headers: {
					'Content-Type': contentType,
					'Content-Disposition': `attachment; filename="${filename}"`,
					'X-Cache-Status': 'MISS'
				}
			});
		}

		default:
			throw error(400, 'Invalid format. Supported: html, markdown, json, pdf, docx');
	}
}

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const format = url.searchParams.get('format') || 'html';
	try {
		return await handleExport({ locals, params, format });
	} catch (err) {
		console.error('Export error:', err);
		if (err instanceof Error && 'status' in err) throw err;
		throw error(500, 'Failed to export report');
	}
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const raw = await request.json();
	const parsed = reportExportSchema.safeParse(raw);
	const format = parsed.success ? parsed.data.format : 'html';
	try {
		const result = await handleExport({ locals, params, format, request });

		// For POST, return JSON with download info instead of direct download
		// This is more MCP-friendly
		const contentType = result.headers.get('Content-Type') || 'application/octet-stream';
		const contentDisposition = result.headers.get('Content-Disposition') || '';
		const filename = contentDisposition.match(/filename="([^"]+)"/)?.[1] || `export.${format}`;

		// For JSON responses (errors), return as-is
		if (contentType.includes('application/json')) {
			return result;
		}

		// For successful exports, return metadata with download URL
		return json({
			success: true,
			format,
			filename,
			contentType,
			message: `Report exported successfully as ${format.toUpperCase()}`,
			// For MCP tools, provide download URL since we can't return binary data
			downloadUrl: `/api/reports/${params.id}/export?format=${format}`
		});
	} catch (err) {
		console.error('Export error:', err);
		if (err instanceof Error && 'status' in err) throw err;
		throw error(500, 'Failed to export report');
	}
};

function generateHTML(report: any): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(report.title)}</title>
	<style>
		@media print {
			@page { margin: 1in; }
		}
		body {
			font-family: 'Georgia', serif;
			line-height: 1.6;
			max-width: 8.5in;
			margin: 0 auto;
			padding: 1in;
			color: #333;
		}
		h1 {
			font-size: 2em;
			margin-bottom: 0.5em;
			border-bottom: 2px solid #333;
			padding-bottom: 0.25em;
		}
		h2 {
			font-size: 1.5em;
			margin-top: 1.5em;
			margin-bottom: 0.5em;
		}
		h3 {
			font-size: 1.2em;
			margin-top: 1em;
			margin-bottom: 0.5em;
		}
		p {
			margin: 1em 0;
		}
		ul, ol {
			margin: 1em 0;
			padding-left: 2em;
		}
		table {
			border-collapse: collapse;
			width: 100%;
			margin: 1em 0;
		}
		th, td {
			border: 1px solid #ddd;
			padding: 8px;
			text-align: left;
		}
		th {
			background-color: #f4f4f4;
			font-weight: bold;
		}
		.metadata {
			color: #666;
			font-size: 0.9em;
			margin-bottom: 2em;
			padding-bottom: 1em;
			border-bottom: 1px solid #ddd;
		}
		.footer {
			margin-top: 3em;
			padding-top: 1em;
			border-top: 1px solid #ddd;
			color: #666;
			font-size: 0.85em;
		}
	</style>
</head>
<body>
	<div class="metadata">
		<strong>${escapeHtml(report.status.replace('_', ' ').toUpperCase())}</strong><br>
		Generated: ${new Date().toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		})}
	</div>

	${report.content || '<p>No content</p>'}

	<div class="footer">
		Report ID: ${report.id}<br>
		Created: ${new Date(report.createdAt).toLocaleDateString()}<br>
		Last Modified: ${new Date(report.updatedAt).toLocaleDateString()}
	</div>
</body>
</html>`;
}

function htmlToMarkdown(html: string): string {
	return html
		.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
		.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
		.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
		.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
		.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
		.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
		.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
		.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
		.replace(/<ul[^>]*>(.*?)<\/ul>/gs, (_match, inner) => {
			return inner.replace(/<li[^>]*>(.*?)<\/li>/g, '- $1\n') + '\n';
		})
		.replace(/<ol[^>]*>(.*?)<\/ol>/gs, (_match, inner) => {
			let counter = 1;
			return (
				inner.replace(/<li[^>]*>(.*?)<\/li>/g, (_m: string, content: string) => `${counter++}. ${content}\n`) + '\n'
			);
		})
		.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function escapeHtml(text: string): string {
	const map: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;'
	};
	return text.replace(/[&<>"']/g, (m) => map[m]);
}

function sanitizeFilename(filename: string): string {
	return filename
		.replace(/[^a-z0-9_\-\.]/gi, '_')
		.replace(/_{2,}/g, '_')
		.substring(0, 100);
}
