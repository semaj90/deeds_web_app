import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { and, eq } from 'drizzle-orm';
import { cases } from '$lib/server/db/schema-postgres.js';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';

const analyzeStreamSchema = z.object({
	analysisType: z.enum(['summary', 'legal_issues', 'risks', 'evidence_review']).optional().default('summary')
});

type AnalysisType = 'summary' | 'legal_issues' | 'risks' | 'evidence_review';

const ANALYSIS_PROMPTS: Record<AnalysisType, string> = {
	summary: `You are a legal analyst AI. Based on the case context below, provide a concise executive summary covering:
- Key facts and timeline
- Parties involved
- Current case status and posture
- Critical deadlines or pending actions
Be specific, reference evidence and statutes where available.`,

	legal_issues: `You are a legal analyst AI. Based on the case context below, identify and analyze the key legal issues:
- Primary legal theories and claims
- Applicable statutes and precedents
- Elements that must be proven
- Potential defenses or counterarguments
- Jurisdictional considerations
Cite specific statutes and evidence from the case file.`,

	risks: `You are a legal analyst AI. Based on the case context below, perform a risk assessment:
- Strengths and weaknesses of the current position
- Evidentiary gaps or vulnerabilities
- Procedural risks or timing concerns
- Potential adverse outcomes and their likelihood
- Recommended mitigation strategies
Rate overall risk as LOW, MEDIUM, HIGH, or CRITICAL with justification.`,

	evidence_review: `You are a legal analyst AI. Based on the case context below, review the evidence:
- Summarize each piece of evidence and its relevance
- Identify authentication or admissibility issues
- Note any gaps in the evidentiary record
- Suggest additional evidence that should be obtained
- Evaluate the strength of the evidence chain
Focus on practical recommendations for case preparation.`
};

async function loadCaseContext(caseId: string): Promise<string> {
	let context = '';

	try {
		const { cases } = await import('$lib/server/db/schema');
		const caseRows = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
		if (!caseRows.length) return 'No case data found.';

		const c = caseRows[0];
		context += `## Case Information\n`;
		context += `- **Title**: ${c.title}\n`;
		if (c.caseNumber) context += `- **Case #**: ${c.caseNumber}\n`;
		if (c.jurisdiction) context += `- **Jurisdiction**: ${c.jurisdiction}\n`;
		if (c.court) context += `- **Court**: ${c.court}\n`;
		if (c.status) context += `- **Status**: ${c.status}\n`;
		if (c.description) context += `- **Description**: ${c.description}\n`;
	} catch {
		context += '## Case: (unable to load details)\n';
	}

	try {
		const { evidence } = await import('$lib/server/db/schema');
		const evidenceRows = await db.select().from(evidence).where(eq(evidence.caseId, caseId)).limit(10);
		if (evidenceRows.length > 0) {
			context += `\n## Evidence (${evidenceRows.length} items)\n`;
			for (const e of evidenceRows) {
				context += `- ${e.title ?? e.fileType ?? 'Untitled'}: ${e.description ?? ''}\n`;
			}
		}
	} catch {
		// Evidence table may not exist
	}

	try {
		const { savedCitations } = await import('$lib/server/db/schema');
		const citationRows = await db.select().from(savedCitations).where(eq(savedCitations.caseId, caseId)).limit(10);
		if (citationRows.length > 0) {
			context += `\n## Citations & Statutes (${citationRows.length} items)\n`;
			for (const cit of citationRows) {
				context += `- ${cit.statuteCode}: ${cit.statuteTitle ?? ''}\n`;
			}
		}
	} catch {
		// Citations table may not exist
	}

	return context || 'No case context available.';
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const caseId = params.id;
	if (!isUuid(caseId)) {
		return new Response(JSON.stringify({ error: 'Invalid case ID format' }), { status: 400 });
	}
	const [targetCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.userId, locals.user.id)))
    .limit(1);
  if (!targetCase) {
    return new Response(JSON.stringify({ error: 'Case not found' }), { status: 404 });
  }
	let raw: unknown;

	try {
		raw = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
	}

	const parsed = analyzeStreamSchema.safeParse(raw);
	if (!parsed.success) {
		return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? 'Invalid analysis type' }), { status: 400 });
	}
	const { analysisType } = parsed.data;

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			const send = (data: unknown) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
			};

			try {
				send({ type: 'start', analysisType, caseId });

				// Load case context
				const caseContext = await loadCaseContext(caseId);
				send({ type: 'context_loaded', hasContext: caseContext.length > 50 });

				// Build full prompt
				const systemPrompt = ANALYSIS_PROMPTS[analysisType];
				const prompt = `${systemPrompt}\n\n---\n\n${caseContext}\n\n---\n\nProvide your analysis now:`;

				// Stream from LLM
				const { llmRouter } = await import('$lib/server/llm-router');

				const responseStream = llmRouter.generateStream({
					prompt,
					provider: 'ollama',
					model: 'gemma4-legal:latest',
					temperature: 0.4,
					maxTokens: 4096
				});

				for await (const chunk of responseStream) {
					if (chunk.content) {
						send({ type: 'token', content: chunk.content });
					}
				}

				send({ type: 'done' });
				controller.close();
			} catch (error) {
				send({
					type: 'error',
					error: 'Analysis failed'
				});
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};