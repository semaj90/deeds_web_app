import { db } from '$lib/server/db/client';
import { cases, evidence } from '$lib/server/db/schema';
import { personsOfInterest } from '$lib/db/schema';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, arrayContains } from 'drizzle-orm';

const OLLAMA_URL = process.env.OLLAMA_HOST ?? 'http://localhost:11434';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { caseId, type = 'charging_memo' } = await request.json();

		if (!caseId) {
			return json({ error: 'Case ID is required' }, { status: 400 });
		}

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

	return generateTemplate(caseData, evidenceData, personsData);
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
	personsData: any[]
): { html: string; json: any; raw: string } {
	const html = `
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

	return {
		html,
		json: { type: 'doc', content: [] },
		raw: `Template-generated charging memo for case: ${caseData.title}`
	};
}
