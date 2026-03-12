import { db } from '$lib/server/db/client';
import { cases, evidence } from '$lib/server/db/schema';
import { personsOfInterest } from '$lib/db/schema';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, arrayContains } from 'drizzle-orm';
import { z } from 'zod';

const generateReportSchema = z.object({
	caseId: z.string().min(1, 'Case ID is required').max(500),
	type: z.string().max(100).optional().default('charging_memo'),
});

const OLLAMA_URL = process.env.OLLAMA_HOST ?? 'http://localhost:11434';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const parsed = generateReportSchema.safeParse(await request.json());
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { caseId, type } = parsed.data;

		// Fetch case data
		const [caseData] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);

		if (!caseData) {
			return json({ error: 'Case not found' }, { status: 404 });
		}

		// Fetch evidence and persons for context
		const evidenceData = await db.select().from(evidence).where(eq(evidence.caseId, caseId));
		let personsData: any[] = [];
		try {
			personsData = await db
				.select()
				.from(personsOfInterest)
				.where(arrayContains(personsOfInterest.caseIds, [caseId]));
		} catch { /* table may not exist */ }

		// Try AI generation first, fall back to template
		const generatedContent = await generateWithAI(caseData, evidenceData, personsData, type);

		// Create new report
		let newReport: any = null;
		try {
			const { reports } = await import('$lib/server/db/schema');
			const [row] = await db
				.insert(reports)
				.values({
					caseId,
					title: `${type === 'charging_memo' ? 'Charging Memo' : 'Report'} - ${caseData.title}`,
					content: generatedContent.html,
					metadata: { type, contentJson: generatedContent.json, rawModelOutput: generatedContent.raw },
				})
				.returning();
			newReport = row;
		} catch {
			// Reports table may not exist — return generated content without saving
		}

		return json({
			success: true,
			report: newReport ?? { content: generatedContent.html, title: `Report - ${caseData.title}` }
		});
	} catch (error) {
		console.error('Error generating report:', error);
		return json(
			{
				error: 'Failed to generate report',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

/**
 * Try Ollama AI generation, fall back to template if unavailable
 */
async function generateWithAI(
	caseData: any,
	evidenceData: any[],
	personsData: any[],
	type: string
): Promise<{ html: string; json: any; raw: string }> {
	const context = buildCaseContext(caseData, evidenceData, personsData);
	const prompt = `You are a legal document generator. Generate a professional ${type === 'charging_memo' ? 'Charging Memorandum' : 'Legal Report'} in HTML format.

## Case Information
${context}

Generate the document with these sections:
1. Case Summary (status, priority, key dates)
2. Persons of Interest (names, roles, threat levels)
3. Evidence Summary (types, descriptions, relevance)
4. Recommended Charges (based on evidence and persons)
5. Legal Analysis (strengths, weaknesses, applicable statutes)
6. Conclusion and Recommendation

Output ONLY the HTML content (no markdown, no code fences). Use h1, h2, h3, p, ul, li, strong, em tags.`;

	try {
		const res = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				prompt,
				stream: false,
				options: { temperature: 0.3, num_predict: 2048 }
			}),
			signal: AbortSignal.timeout(30000)
		});

		if (res.ok) {
			const data = await res.json();
			const aiHtml = data.response?.trim() ?? '';
			if (aiHtml.length > 100) {
				return {
					html: aiHtml,
					json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: aiHtml }] }] },
					raw: data.response
				};
			}
		}
	} catch {
		// Ollama unavailable — fall back to template
	}

	return generateTemplate(caseData, evidenceData, personsData, type);
}

function buildCaseContext(caseData: any, evidenceData: any[], personsData: any[]): string {
	let ctx = `Title: ${caseData.title ?? 'Untitled'}\n`;
	ctx += `Status: ${caseData.status ?? 'Unknown'}\n`;
	ctx += `Priority: ${caseData.priority ?? 'Normal'}\n`;
	if (caseData.jurisdiction) ctx += `Jurisdiction: ${caseData.jurisdiction}\n`;
	if (caseData.description) ctx += `Description: ${caseData.description}\n`;
	if (caseData.createdAt) ctx += `Opened: ${new Date(caseData.createdAt).toLocaleDateString()}\n`;

	if (personsData.length) {
		ctx += `\nPersons of Interest (${personsData.length}):\n`;
		for (const p of personsData) {
			ctx += `- ${p.name ?? 'Unknown'} (${p.relationship ?? p.role ?? 'POI'}, threat: ${p.threatLevel ?? 'unknown'})\n`;
		}
	}

	if (evidenceData.length) {
		ctx += `\nEvidence (${evidenceData.length} items):\n`;
		for (const e of evidenceData.slice(0, 10)) {
			ctx += `- ${e.title ?? e.fileName ?? 'Untitled'}: ${e.description ?? 'No description'} [${e.evidenceType ?? e.type ?? 'document'}]\n`;
		}
	}

	return ctx;
}

function generateTemplate(
	caseData: any,
	evidenceData: any[],
	personsData: any[],
	type: string
): { html: string; json: any; raw: string } {
	let html = '';

	switch (type) {
		case 'charging_memo':
			html = `
<h1>Charging Memorandum</h1>
<h2>Case: ${caseData.title || 'Untitled Case'}</h2>
<h3>Case Summary</h3>
<p><strong>Status:</strong> ${caseData.status || 'Unknown'}</p>
<p><strong>Priority:</strong> ${caseData.priority || 'Normal'}</p>
<p><strong>Opened:</strong> ${caseData.createdAt ? new Date(caseData.createdAt).toLocaleDateString() : 'Unknown'}</p>
<h3>Persons of Interest</h3>
${personsData.length > 0 ? `<ul>${personsData.map((p) => `<li><strong>${p.name || 'Unknown'}</strong> — ${p.relationship ?? p.role ?? 'Person of interest'}</li>`).join('')}</ul>` : '<p>No persons of interest identified.</p>'}
<h3>Evidence Summary</h3>
${evidenceData.length > 0 ? `<ul>${evidenceData.map((e) => `<li><strong>${e.evidenceType ?? e.type ?? 'Document'}</strong>: ${e.description || 'No description'}</li>`).join('')}</ul>` : '<p>No evidence currently associated with this case.</p>'}
<h3>Recommended Charges</h3>
<p><em>(AI generation unavailable — complete manually)</em></p>
<h3>Legal Analysis</h3>
<p><em>(AI generation unavailable — complete manually)</em></p>
<h3>Conclusion and Recommendation</h3>
<p><em>(AI generation unavailable — complete manually)</em></p>`.trim();
			break;

		case 'intake_summary':
			html = `
<h1>Intake Summary</h1>
<h2>Case: ${caseData.title || 'Untitled Case'}</h2>
<p><strong>Date:</strong> ${caseData.createdAt ? new Date(caseData.createdAt).toLocaleDateString() : 'Unknown'}</p>
<p><strong>Jurisdiction:</strong> ${caseData.jurisdiction || 'N/A'}</p>
<p><strong>Practice Area:</strong> ${caseData.practiceArea || 'N/A'}</p>
<h3>Client Information</h3>
<p><strong>Client:</strong> ${caseData.clientName || 'Not specified'}</p>
<p><strong>Opposing Party:</strong> ${caseData.opposingParty || 'Not specified'}</p>
<h3>Initial Assessment</h3>
<p><strong>Case Description:</strong> ${caseData.description || 'No description provided.'}</p>
<h3>Persons Involved</h3>
${personsData.length > 0 ? `<ul>${personsData.map((p) => `<li><strong>${p.name || 'Unknown'}</strong> (${p.relationship ?? p.role ?? 'Unknown role'})</li>`).join('')}</ul>` : '<p>No persons identified yet.</p>'}
<h3>Initial Evidence</h3>
${evidenceData.length > 0 ? `<ul>${evidenceData.map((e) => `<li>${e.title ?? e.fileName ?? 'Untitled'} (${e.evidenceType ?? 'Document'})</li>`).join('')}</ul>` : '<p>No evidence uploaded yet.</p>'}
<h3>Recommended Next Steps</h3>
<p><em>1. Conduct client interview</em></p>
<p><em>2. Request additional documentation</em></p>
<p><em>3. Research applicable law and precedents</em></p>
<p><em>4. Assess case strengths and weaknesses</em></p>`.trim();
			break;

		case 'discovery_list':
			html = `
<h1>Discovery List</h1>
<h2>Case: ${caseData.title || 'Untitled Case'}</h2>
<p><strong>Date Prepared:</strong> ${new Date().toLocaleDateString()}</p>
<h3>Documents Currently in Possession</h3>
${evidenceData.length > 0 ? `
<table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;">
<thead>
<tr>
<th>Item #</th>
<th>Description</th>
<th>Type</th>
<th>Date Uploaded</th>
</tr>
</thead>
<tbody>
${evidenceData.map((e, idx) => `
<tr>
<td>${idx + 1}</td>
<td>${e.title ?? e.fileName ?? 'Untitled'}</td>
<td>${e.evidenceType ?? 'Document'}</td>
<td>${e.uploadedAt ? new Date(e.uploadedAt).toLocaleDateString() : 'Unknown'}</td>
</tr>
`).join('')}
</tbody>
</table>
` : '<p>No evidence currently in possession.</p>'}
<h3>Outstanding Discovery Requests</h3>
<p><em>(List discovery requests and responses here)</em></p>
<h3>Persons with Relevant Knowledge</h3>
${personsData.length > 0 ? `<ul>${personsData.map((p) => `<li><strong>${p.name || 'Unknown'}</strong> — ${p.relationship ?? p.role ?? 'Witness'}</li>`).join('')}</ul>` : '<p>No persons identified.</p>'}`.trim();
			break;

		case 'hearing_prep':
			html = `
<h1>Hearing Preparation Summary</h1>
<h2>Case: ${caseData.title || 'Untitled Case'}</h2>
<p><strong>Hearing Date:</strong> <em>(Enter hearing date)</em></p>
<p><strong>Court:</strong> ${caseData.court || 'N/A'}</p>
<p><strong>Judge:</strong> <em>(Enter judge name)</em></p>
<h3>Hearing Type & Purpose</h3>
<p><em>(Describe the type of hearing and objectives)</em></p>
<h3>Key Arguments</h3>
<p><strong>1. Primary Argument:</strong> <em>(State main legal argument)</em></p>
<p><strong>2. Supporting Arguments:</strong> <em>(List supporting points)</em></p>
<p><strong>3. Anticipated Counterarguments:</strong> <em>(List opposing arguments and rebuttals)</em></p>
<h3>Evidence to Present</h3>
${evidenceData.length > 0 ? `<ul>${evidenceData.map((e) => `<li><strong>${e.title ?? e.fileName ?? 'Untitled'}</strong> — Relevance: <em>(Explain relevance)</em></li>`).join('')}</ul>` : '<p>No evidence identified for presentation.</p>'}
<h3>Witnesses</h3>
${personsData.length > 0 ? `<ul>${personsData.map((p) => `<li><strong>${p.name || 'Unknown'}</strong> — Testimony focus: <em>(Brief description)</em></li>`).join('')}</ul>` : '<p>No witnesses identified.</p>'}
<h3>Legal Citations</h3>
<p><em>(List relevant statutes, cases, and legal authorities)</em></p>
<h3>Questions to Prepare For</h3>
<p><em>1. (Potential question from judge)</em></p>
<p><em>2. (Potential question from opposing counsel)</em></p>
<h3>Action Items Before Hearing</h3>
<p><em>□ Review all case files</em></p>
<p><em>□ Prepare opening statement</em></p>
<p><em>□ Organize exhibits</em></p>
<p><em>□ Brief witnesses</em></p>`.trim();
			break;

		default:
			html = `<h1>Legal Report</h1><h2>${caseData.title || 'Untitled Case'}</h2><p>Report type: ${type}</p>`;
	}

	return {
		html,
		json: { type: 'doc', content: [] },
		raw: `Template-generated ${type} for case: ${caseData.title}`
	};
}
