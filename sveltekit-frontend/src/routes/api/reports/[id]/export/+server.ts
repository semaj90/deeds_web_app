import { db } from '$lib/server/db/client';
import { reports } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { auditReportAction } from '$lib/server/reports/audit.js';
import {
	getCachedExport,
	cacheExport,
	cacheExportBinary
} from '$lib/server/cache/pdf-export-cache.js';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';

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
				eq(reports.createdBy, locals.user.id)
			)
		)
		.limit(1);

	if (!report) {
		throw error(404, 'Report not found');
	}

	// Guard nullable updatedAt (schema marks column non-required)
	const reportUpdatedAt = report.updatedAt ?? report.createdAt ?? new Date();

	// Check cache first (Option #3: PDF Export Caching)
	const cached = await getCachedExport(reportId, format, reportUpdatedAt);
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

		// Decode base64 content for binary formats (docx, pdf)
		const body = cached.isBase64
			? Buffer.from(cached.content, 'base64')
			: cached.content;

		return new Response(body, {
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
			await cacheExport(reportId, format, content, contentType, filename, reportUpdatedAt);

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
			await cacheExport(reportId, format, content, contentType, filename, reportUpdatedAt);

			return new Response(content, {
				headers: {
					'Content-Type': contentType,
					'Content-Disposition': `attachment; filename="${filename}"`,
					'X-Cache-Status': 'MISS'
				}
			});
		}

		case 'pdf':
			// PDF generation requires puppeteer or jspdf — redirect to HTML with print hint
			return json(
				{
					error: 'PDF export requires a headless browser',
					instructions: 'Use the HTML export and print to PDF in your browser (Ctrl+P → Save as PDF)',
					fallback: `/api/reports/${reportId}/export?format=html`
				},
				{ status: 501 }
			);

		case 'docx': {
			const docxBuf = generateDocx(report);
			const filename = `${sanitizeFilename(report.title)}.docx`;
			const contentType =
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

			// Cache as base64 (non-fatal — fire-and-forget)
			cacheExportBinary(reportId, format, docxBuf, contentType, filename, reportUpdatedAt)
				.catch(err => console.warn('[Export] DOCX cache failed (non-fatal):', err));

			return new Response(new Uint8Array(docxBuf), {
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
			await cacheExport(reportId, format, content, contentType, filename, reportUpdatedAt);

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

function generateHTML(report: Record<string, any>): string {
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

// ── DOCX generation (pure-JS, no external dependencies) ─────────────────────

function crc32(buf: Buffer): number {
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		let b = (crc ^ buf[i]) & 0xff;
		for (let j = 0; j < 8; j++) b = b & 1 ? (b >>> 1) ^ 0xedb88320 : b >>> 1;
		crc = (crc >>> 8) ^ b;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(files: { name: string; data: Buffer }[]): Buffer {
	const parts: Buffer[] = [];
	const centralDir: Buffer[] = [];
	let offset = 0;
	const now = new Date();
	const dosTime =
		((now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)) >>> 0;
	const dosDate =
		(((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) >>> 0;

	for (const file of files) {
		const name = Buffer.from(file.name, 'utf8');
		const data = file.data;
		const checksum = crc32(data);

		const local = Buffer.alloc(30 + name.length);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0, 6);
		local.writeUInt16LE(0, 8); // STORED
		local.writeUInt16LE(dosTime, 10);
		local.writeUInt16LE(dosDate, 12);
		local.writeUInt32LE(checksum, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(name.length, 26);
		local.writeUInt16LE(0, 28);
		name.copy(local, 30);

		const central = Buffer.alloc(46 + name.length);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0, 8);
		central.writeUInt16LE(0, 10); // STORED
		central.writeUInt16LE(dosTime, 12);
		central.writeUInt16LE(dosDate, 14);
		central.writeUInt32LE(checksum, 16);
		central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt16LE(0, 30);
		central.writeUInt16LE(0, 32);
		central.writeUInt16LE(0, 34);
		central.writeUInt16LE(0, 36);
		central.writeUInt32LE(0, 38);
		central.writeUInt32LE(offset, 42);
		name.copy(central, 46);

		parts.push(local, data);
		centralDir.push(central);
		offset += local.length + data.length;
	}

	const centralBuf = Buffer.concat(centralDir);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(0, 4);
	eocd.writeUInt16LE(0, 6);
	eocd.writeUInt16LE(files.length, 8);
	eocd.writeUInt16LE(files.length, 10);
	eocd.writeUInt32LE(centralBuf.length, 12);
	eocd.writeUInt32LE(offset, 16);
	eocd.writeUInt16LE(0, 20);

	return Buffer.concat([...parts, centralBuf, eocd]);
}

function escapeXml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function htmlToOoxmlParagraphs(html: string): string {
	const src = html.replace(/\r\n/g, '\n').replace(/<br\s*\/?>/gi, '\n');
	const paragraphs: string[] = [];

	function inlineToRuns(inner: string): string {
		const normalised = inner
			.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '\x00BOLD\x01$2\x00END\x01')
			.replace(/<[^>]+>/g, '')
			.replace(/&amp;/gi, '&')
			.replace(/&lt;/gi, '<')
			.replace(/&gt;/gi, '>')
			.replace(/&quot;/gi, '"')
			.replace(/&nbsp;/gi, ' ')
			.replace(/&#039;/gi, "'");

		let result = '';
		const boldRe = /\x00BOLD\x01([\s\S]*?)\x00END\x01/g;
		let lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = boldRe.exec(normalised)) !== null) {
			if (match.index > lastIndex) {
				const plain = escapeXml(normalised.slice(lastIndex, match.index));
				if (plain.trim())
					result += `<w:r><w:t xml:space="preserve">${plain}</w:t></w:r>`;
			}
			const bold = escapeXml(match[1]);
			if (bold.trim())
				result += `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${bold}</w:t></w:r>`;
			lastIndex = match.index + match[0].length;
		}
		const tail = escapeXml(normalised.slice(lastIndex));
		if (tail.trim()) result += `<w:r><w:t xml:space="preserve">${tail}</w:t></w:r>`;
		return result;
	}

	const blockRe = /<(h[1-3]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
	let m: RegExpExecArray | null;
	while ((m = blockRe.exec(src)) !== null) {
		const tag = m[1].toLowerCase();
		const runs = inlineToRuns(m[2]);
		if (!runs) continue;
		if (tag === 'h1') {
			paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${runs}</w:p>`);
		} else if (tag === 'h2') {
			paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${runs}</w:p>`);
		} else if (tag === 'h3') {
			paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr>${runs}</w:p>`);
		} else if (tag === 'li') {
			paragraphs.push(`<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${runs}</w:p>`);
		} else {
			paragraphs.push(`<w:p>${runs}</w:p>`);
		}
	}

	return paragraphs.join('\n') || '<w:p><w:r><w:t> </w:t></w:r></w:p>';
}

function generateDocx(report: Record<string, any>): Buffer {
	const title = String(report.title ?? 'Report');
	const status = String(report.status ?? '').replace(/_/g, ' ').toUpperCase();
	const created = new Date(report.createdAt).toLocaleDateString('en-US', {
		year: 'numeric', month: 'long', day: 'numeric'
	});
	const updated = new Date(report.updatedAt).toLocaleDateString('en-US', {
		year: 'numeric', month: 'long', day: 'numeric'
	});
	const bodyParagraphs = htmlToOoxmlParagraphs(report.content ?? '');
	const NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

	const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>`;

	const packageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

	const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`;

	const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings ${NS_W}>
  <w:defaultTabStop w:val="720"/>
</w:settings>`;

	const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS_W}
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>
      <w:r><w:t>${escapeXml(title)}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr>
        <w:t xml:space="preserve">${escapeXml(status)} · Created ${escapeXml(created)} · Updated ${escapeXml(updated)}</w:t>
      </w:r>
    </w:p>
    <w:p/>
    ${bodyParagraphs}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

	return buildZip([
		{ name: '[Content_Types].xml',          data: Buffer.from(contentTypes, 'utf8') },
		{ name: '_rels/.rels',                  data: Buffer.from(packageRels, 'utf8') },
		{ name: 'word/_rels/document.xml.rels', data: Buffer.from(docRels, 'utf8') },
		{ name: 'word/settings.xml',            data: Buffer.from(settings, 'utf8') },
		{ name: 'word/document.xml',            data: Buffer.from(document, 'utf8') },
	]);
}
