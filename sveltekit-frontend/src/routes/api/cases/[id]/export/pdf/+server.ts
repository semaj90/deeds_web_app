import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { cases, evidence, caseNotes, citations, personsOfInterest } from '$lib/server/db/schema';
import { and, arrayContains, eq, desc, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { isUuid } from '$lib/server/validation.js';

const safe = <T>(p: Promise<T>, fallback: T): Promise<T> =>
	Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject('timeout'), 5000))]).catch(
		() => fallback
	);

function esc(str: string | null | undefined): string {
	if (!str) return '';
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function fmtDate(d: string | Date | null | undefined): string {
	if (!d) return '—';
	try {
		return new Date(d).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	} catch {
		return String(d);
	}
}

/**
 * POST /api/cases/[id]/export/pdf
 * Generates a print-friendly HTML case packet for download.
 * The user can open the HTML and use browser Print > Save as PDF.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const id = params.id;
	if (!isUuid(id)) {
		return new Response(JSON.stringify({ error: 'Invalid case ID format' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const caseRows = await safe(
    db
      .select()
      .from(cases)
      .where(and(eq(cases.id, id), eq(cases.userId, locals.user.id)))
      .limit(1),
    []
  );

	const caseRow = caseRows[0];
	if (!caseRow) {
		return new Response(JSON.stringify({ error: 'Case not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const [evidenceRows, noteRows, personRows, citationRows] = await Promise.all([
    safe(
      db
        .select()
        .from(evidence)
        .where(and(eq(evidence.caseId, id), eq(evidence.userId, locals.user.id)))
        .limit(200),
      []
    ),
    safe(
      db
        .select()
        .from(caseNotes)
        .where(eq(caseNotes.caseId, id))
        .orderBy(desc(caseNotes.isPinned), desc(caseNotes.updatedAt))
        .limit(100),
      []
    ),
    safe(
      db
        .select()
        .from(personsOfInterest)
        .where(arrayContains(personsOfInterest.caseIds, [id]))
        .limit(50),
      []
    ),
    safe(
      db
        .select({
          id: citations.id,
          pageNumber: citations.pageNumber,
          createdAt: citations.createdAt,
          quotedText: sql<string>`"citations"."quoted_text"`,
          citationType: sql<string>`"citations"."citation_type"`,
          relevanceScore: sql<number>`"citations"."relevance_score"`,
          formattedCitation: sql<string>`"citations"."formatted_citation"`,
          isKeyAuthority: sql<boolean>`"citations"."is_key_authority"`,
        })
        .from(citations)
        .where(eq(citations.caseId, id))
        .limit(100),
      []
    ),
  ]);

	const title = esc(caseRow.title) || 'Untitled Case';
	const caseNum = esc(caseRow.caseNumber) || `#${id}`;
	const now = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
	const evRows = evidenceRows.length
		? evidenceRows
				.map(
					(e, i) =>
						`<tr><td>${i + 1}</td><td>${esc(e.title ?? e.fileName)}</td><td>${esc(e.evidenceType) || 'document'}</td><td>${esc(e.source) || '—'}</td><td>${fmtDate(e.dateObtained ?? e.createdAt)}</td></tr>`
				)
				.join('')
		: '<tr><td colspan="5" class="empty">No evidence items attached.</td></tr>';

	const poiRows = personRows.length
		? personRows
				.map(
					(p) =>
						`<tr><td>${esc(p.name)}</td><td>${esc(p.relationship) || 'Person of interest'}</td><td>${esc(p.threatLevel) || '—'}</td><td>${esc(p.status) || '—'}</td></tr>`
				)
				.join('')
		: '<tr><td colspan="4" class="empty">No persons of interest recorded.</td></tr>';

	const citRows = citationRows.length
		? citationRows
				.map(
					(c: Record<string, any>) =>
						`<tr><td>${esc(c.formattedCitation) || '—'}</td><td>${esc(c.citationType) || '—'}</td><td class="quoted">${esc(c.quotedText?.slice(0, 200)) || '—'}${(c.quotedText?.length ?? 0) > 200 ? '...' : ''}</td><td>${c.relevanceScore ? Math.round(c.relevanceScore * 100) + '%' : '—'}</td><td>${c.isKeyAuthority ? 'Yes' : '—'}</td></tr>`
				)
				.join('')
		: '<tr><td colspan="5" class="empty">No citations attached.</td></tr>';

	const notesCards = noteRows.length
		? noteRows
				.map(
					(n) =>
						`<div class="note-card"><div class="note-header"><strong>${esc(n.title) || 'Note'}</strong><span class="note-badges">${n.isPinned ? '<span class="badge pinned">PINNED</span>' : ''}${n.isAI ? '<span class="badge ai">AI</span>' : ''}</span><span class="note-date">${fmtDate(n.updatedAt ?? n.createdAt)}</span></div><div class="note-content">${esc(n.content)}</div></div>`
				)
				.join('')
		: '<p class="empty">No case notes recorded.</p>';

	const css = [
		'@page{size:letter;margin:.75in}',
		'*{box-sizing:border-box;margin:0;padding:0}',
		'body{font-family:"Segoe UI",system-ui,-apple-system,sans-serif;font-size:11pt;line-height:1.5;color:#1a1a1a;background:#fff}',
		'.cover{page-break-after:always;display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:80vh;text-align:center;border:2px solid #333;padding:3rem}',
		'.cover h1{font-size:24pt;margin-bottom:.5rem}',
		'.cover .case-number{font-size:14pt;color:#555;margin-bottom:2rem}',
		'.cover .meta{font-size:10pt;color:#777}',
		'.cover .meta span{display:block;margin:.25rem 0}',
		'.cover .stamp{margin-top:2rem;padding:.5rem 1.5rem;border:1px solid #999;border-radius:4px;font-size:9pt;color:#999;text-transform:uppercase;letter-spacing:.1em}',
		'.section{margin-bottom:2rem}',
		'.section-title{font-size:14pt;font-weight:700;border-bottom:2px solid #333;padding-bottom:.25rem;margin-bottom:1rem}',
		'.details-grid{display:grid;grid-template-columns:1fr 1fr;gap:.5rem 2rem}',
		'.detail-item label{display:block;font-size:8pt;text-transform:uppercase;letter-spacing:.05em;color:#888;margin-bottom:.1rem}',
		'.detail-item p{font-size:10pt}',
		'table{width:100%;border-collapse:collapse;font-size:10pt;page-break-inside:auto}',
		'thead{background:#f0f0f0}',
		'th,td{text-align:left;padding:6px 10px;border:1px solid #ddd}',
		'th{font-weight:600;font-size:9pt;text-transform:uppercase;letter-spacing:.03em}',
		'tr{page-break-inside:avoid}',
		'.empty{text-align:center;color:#999;font-style:italic;padding:1rem}',
		'.note-card{border:1px solid #ddd;border-radius:4px;padding:.75rem;margin-bottom:.75rem;page-break-inside:avoid}',
		'.note-header{display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;font-size:10pt}',
		'.note-badges{display:flex;gap:.25rem}',
		'.badge{font-size:7pt;padding:1px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:.05em;font-weight:600}',
		'.badge.pinned{background:#fef3c7;color:#92400e}',
		'.badge.ai{background:#dbeafe;color:#1e40af}',
		'.note-date{margin-left:auto;font-size:9pt;color:#999}',
		'.note-content{font-size:10pt;white-space:pre-line;color:#333}',
		'.quoted{font-size:9pt;font-style:italic;color:#555;max-width:300px}',
		'.page-footer{margin-top:3rem;padding-top:.5rem;border-top:1px solid #ccc;font-size:8pt;color:#aaa;text-align:center}',
		'@media print{body{background:none}.no-print{display:none}}'
	].join(' ');

	const coverMeta = [
		`<span>Status: ${esc(caseRow.status) || 'Draft'}</span>`,
		`<span>Priority: ${esc(caseRow.priority) || '—'}</span>`,
		caseRow.practiceArea ? `<span>Practice Area: ${esc(caseRow.practiceArea)}</span>` : '',
		caseRow.jurisdiction
			? `<span>Jurisdiction: ${esc(caseRow.jurisdiction)}${caseRow.court ? ' — ' + esc(caseRow.court) : ''}</span>`
			: '',
		caseRow.clientName ? `<span>Client: ${esc(caseRow.clientName)}</span>` : '',
		caseRow.opposingParty ? `<span>Opposing Party: ${esc(caseRow.opposingParty)}</span>` : '',
		caseRow.filingDate ? `<span>Filing Date: ${fmtDate(caseRow.filingDate)}</span>` : '',
		caseRow.dueDate ? `<span>Due Date: ${fmtDate(caseRow.dueDate)}</span>` : ''
	]
		.filter(Boolean)
		.join('');

	const detailCells = [
		`<div class="detail-item"><label>Title</label><p>${title}</p></div>`,
		`<div class="detail-item"><label>Case Number</label><p>${caseNum}</p></div>`,
		`<div class="detail-item"><label>Status</label><p>${esc(caseRow.status) || 'Draft'}</p></div>`,
		`<div class="detail-item"><label>Priority</label><p>${esc(caseRow.priority) || '—'}</p></div>`,
		caseRow.practiceArea
			? `<div class="detail-item"><label>Practice Area</label><p>${esc(caseRow.practiceArea)}</p></div>`
			: '',
		caseRow.jurisdiction
			? `<div class="detail-item"><label>Jurisdiction</label><p>${esc(caseRow.jurisdiction)}</p></div>`
			: '',
		caseRow.court
			? `<div class="detail-item"><label>Court</label><p>${esc(caseRow.court)}</p></div>`
			: '',
		caseRow.clientName
			? `<div class="detail-item"><label>Client</label><p>${esc(caseRow.clientName)}</p></div>`
			: '',
		caseRow.opposingParty
			? `<div class="detail-item"><label>Opposing Party</label><p>${esc(caseRow.opposingParty)}</p></div>`
			: ''
	]
		.filter(Boolean)
		.join('');

	const descBlock = caseRow.description
		? `<div style="margin-top:1rem"><label style="font-size:8pt;text-transform:uppercase;letter-spacing:.05em;color:#888">Description</label><p style="font-size:10pt;white-space:pre-line;margin-top:.25rem">${esc(caseRow.description)}</p></div>`
		: '';

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Case Packet — ${title}</title>
<style>${css}</style>
</head>
<body>
<div class="cover">
<h1>${title}</h1>
<div class="case-number">Case ${caseNum}</div>
<div class="meta">${coverMeta}</div>
<div class="stamp">Confidential — Case Packet</div>
</div>
<div class="section">
<h2 class="section-title">Case Details</h2>
<div class="details-grid">${detailCells}</div>
${descBlock}
</div>
<div class="section">
<h2 class="section-title">Evidence (${evidenceRows.length} items)</h2>
<table><thead><tr><th>#</th><th>Title / Filename</th><th>Type</th><th>Source</th><th>Date</th></tr></thead><tbody>${evRows}</tbody></table>
</div>
<div class="section">
<h2 class="section-title">Persons of Interest (${personRows.length})</h2>
<table><thead><tr><th>Name</th><th>Role / Relationship</th><th>Threat Level</th><th>Status</th></tr></thead><tbody>${poiRows}</tbody></table>
</div>
<div class="section">
<h2 class="section-title">Citations (${citationRows.length})</h2>
<table><thead><tr><th>Citation</th><th>Type</th><th>Quoted Text</th><th>Relevance</th><th>Key</th></tr></thead><tbody>${citRows}</tbody></table>
</div>
<div class="section">
<h2 class="section-title">Case Notes (${noteRows.length})</h2>
${notesCards}
</div>
<div class="page-footer">Generated ${now} • Deeds Legal AI Platform • Case ${caseNum}</div>
</body>
</html>`;

	const filename = `case-${id}-packet-${Date.now()}.html`;

	return new Response(html, {
		status: 200,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};

