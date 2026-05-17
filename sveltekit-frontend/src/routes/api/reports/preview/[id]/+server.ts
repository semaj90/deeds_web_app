/**
 * GET /api/reports/preview/[id]?format=html
 * POST /api/reports/preview/[id] with { format: 'html' }
 *
 * Generate in-browser preview of report as data URL
 * Perfect for iframe embedding or immediate browser display without download
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { db } from '$lib/server/db/client';
import { reports } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { auditReportAction } from '$lib/server/reports/audit.js';
import { CACHE_PATTERNS, cacheInvalidation } from '$lib/server/cache/invalidation.js';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';

const reportPreviewSchema = z.object({
	format: z.enum(['html', 'json']).optional().default('html')
});

async function generatePreview({ locals, params, format, request }: {
	locals: App.Locals;
	params: { id: string };
	format: string;
	request?: Request;
}) {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!isUuid(params.id)) {
		throw error(400, 'Invalid ID format');
	}

	const reportId = params.id;

	// Fetch report and verify ownership
	const [report] = await db
		.select()
		.from(reports)
		.where(
			and(
				eq(reports.id, reportId),
				eq(reports.createdBy, Number(locals.user.id))
			)
		)
		.limit(1);

	if (!report) {
		throw error(404, 'Report not found');
	}

	// Generate preview content based on format
	let dataUrl = '';
	let filename = '';
	let mimeType = '';

	switch (format) {
		case 'html': {
			const htmlContent = generatePreviewHTML(report);
			dataUrl = `data:text/html;base64,${Buffer.from(htmlContent).toString('base64')}`;
			filename = `${sanitizeFilename(report.title)}_preview.html`;
			mimeType = 'text/html';
			break;
		}

		case 'json': {
			const jsonContent = JSON.stringify({
				id: report.id,
				title: report.title,
				status: report.status,
				content: report.content,
				metadata: report.metadata,
				createdAt: report.createdAt,
				updatedAt: report.updatedAt
			}, null, 2);
			dataUrl = `data:application/json;base64,${Buffer.from(jsonContent).toString('base64')}`;
			filename = `${sanitizeFilename(report.title)}_preview.json`;
			mimeType = 'application/json';
			break;
		}

		default:
			throw error(400, `Invalid preview format: ${format}. Supported: html, json`);
	}

	// Audit log: report previewed
	await auditReportAction({
		reportId: report.id,
		userId: locals.user.id,
		action: 'previewed',
		changes: { format, preview: true },
		request,
	}).catch(err => console.warn('[Preview] Audit log failed:', err));

	// Invalidate preview cache (allow fresh previews if content changed)
	await cacheInvalidation.invalidatePattern(
		CACHE_PATTERNS.REPORT_PREVIEW(report.id),
		{ type: 'manual', userId: locals.user.id }
	).catch(err => console.warn('[Preview] Cache invalidation failed:', err));

	return {
		dataUrl,
		filename,
		mimeType,
		reportId: report.id,
		reportTitle: report.title
	};
}

export const GET: RequestHandler = async ({ locals, params, url, request }) => {
	const format = url.searchParams.get('format') || 'html';
	try {
		const result = await generatePreview({ locals, params, format });
		const responseData = {
			success: true,
			...result,
			message: `Preview generated successfully as ${format.toUpperCase()}`
		};

		const { etag, isMatch } = checkETag(responseData, request.headers);
		if (isMatch) return notModified(etag);

		return json(responseData, {
			headers: { ...cacheControl.short, ETag: etag }
		});
	} catch (err) {
		console.error('Preview error:', err);
		if (err instanceof Error && 'status' in err) throw err;
		throw error(500, 'Failed to generate preview');
	}
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const raw = await request.json();
	const parsed = reportPreviewSchema.safeParse(raw);
	const format = parsed.success ? parsed.data.format : 'html';
	try {
		const result = await generatePreview({ locals, params, format, request });
		return json({
			success: true,
			...result,
			message: `Preview generated successfully as ${format.toUpperCase()}`
		});
	} catch (err) {
		console.error('Preview error:', err);
		if (err instanceof Error && 'status' in err) throw err;
		throw error(500, 'Failed to generate preview');
	}
};

/**
 * Generate HTML preview with enhanced styling for in-browser viewing
 */
function generatePreviewHTML(report: Record<string, any>): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(report.title)} - Preview</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
			line-height: 1.6;
			max-width: 900px;
			margin: 0 auto;
			padding: 40px 20px;
			color: #1a1a1a;
			background: #f9f9f9;
		}
		.preview-banner {
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			color: white;
			padding: 12px 20px;
			border-radius: 8px;
			margin-bottom: 30px;
			display: flex;
			align-items: center;
			gap: 10px;
			box-shadow: 0 2px 8px rgba(0,0,0,0.1);
		}
		.preview-banner::before {
			content: "👁️";
			font-size: 1.2em;
		}
		.container {
			background: white;
			padding: 40px;
			border-radius: 12px;
			box-shadow: 0 4px 16px rgba(0,0,0,0.08);
		}
		h1 {
			font-size: 2.2em;
			margin-bottom: 0.3em;
			color: #1a1a1a;
			border-bottom: 3px solid #667eea;
			padding-bottom: 0.3em;
		}
		h2 {
			font-size: 1.6em;
			margin-top: 1.5em;
			margin-bottom: 0.5em;
			color: #2d2d2d;
		}
		h3 {
			font-size: 1.3em;
			margin-top: 1.2em;
			margin-bottom: 0.4em;
			color: #3d3d3d;
		}
		p {
			margin: 1em 0;
			color: #333;
		}
		ul, ol {
			margin: 1em 0;
			padding-left: 2em;
		}
		li {
			margin: 0.5em 0;
		}
		table {
			border-collapse: collapse;
			width: 100%;
			margin: 1.5em 0;
			border-radius: 8px;
			overflow: hidden;
			box-shadow: 0 2px 8px rgba(0,0,0,0.05);
		}
		th, td {
			border: 1px solid #e0e0e0;
			padding: 12px 16px;
			text-align: left;
		}
		th {
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			color: white;
			font-weight: 600;
		}
		tr:nth-child(even) {
			background-color: #f8f8f8;
		}
		.metadata {
			background: #f5f5f5;
			border-left: 4px solid #667eea;
			padding: 16px 20px;
			margin-bottom: 30px;
			border-radius: 4px;
			font-size: 0.95em;
			color: #555;
		}
		.metadata strong {
			color: #1a1a1a;
			font-weight: 600;
		}
		.footer {
			margin-top: 50px;
			padding-top: 20px;
			border-top: 2px solid #e0e0e0;
			text-align: center;
			color: #777;
			font-size: 0.9em;
		}
		code {
			background: #f5f5f5;
			padding: 2px 6px;
			border-radius: 3px;
			font-family: 'Courier New', monospace;
			font-size: 0.9em;
		}
		blockquote {
			border-left: 4px solid #667eea;
			padding-left: 20px;
			margin: 1.5em 0;
			color: #555;
			font-style: italic;
		}
		@media print {
			.preview-banner {
				display: none;
			}
			body {
				background: white;
			}
			.container {
				box-shadow: none;
				padding: 0;
			}
		}
	</style>
</head>
<body>
	<div class="preview-banner">
		<strong>PREVIEW MODE</strong>
		<span>|</span>
		<span>This is a live preview of your report</span>
	</div>

	<div class="container">
		<h1>${escapeHtml(report.title)}</h1>

		<div class="metadata">
			<p><strong>Status:</strong> ${escapeHtml(report.status.replace('_', ' ').toUpperCase())}</p>
			<p><strong>Created:</strong> ${new Date(report.createdAt).toLocaleString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			})}</p>
			<p><strong>Last Updated:</strong> ${new Date(report.updatedAt).toLocaleString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			})}</p>
		</div>

		<div class="content">
			${report.content || '<p style="color: #999; font-style: italic;">No content yet. Start writing to see your report preview.</p>'}
		</div>

		<div class="footer">
			<p>Report ID: <code>${report.id}</code></p>
			<p style="margin-top: 10px; font-size: 0.85em;">Generated at ${new Date().toLocaleString()}</p>
		</div>
	</div>
</body>
</html>`;
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
