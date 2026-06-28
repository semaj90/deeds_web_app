import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assembleACEContext, buildACEPromptCached } from '$lib/server/ace/context-assembler.js';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { ollamaFetch, getOllamaGenerationEndpoint } from '$lib/server/ollama.js';

const aceSummarizeSchema = z.object({
	evidenceId: z.string().uuid().optional(),
	caseId: z.string().uuid().optional(),
	content: z.string().max(50000).optional(),
	title: z.string().max(500).optional()
}).refine(d => d.content || d.evidenceId, {
	message: 'Must provide either content or evidenceId'
});

// Zod schema for Ollama structured output — GBNF grammar constraining guarantees valid JSON
const summaryResponseSchema = z.object({
	summary: z.string(),
	keyInsights: z.array(z.string()),
	confidence: z.number()
});
const summaryJsonSchema = z.toJSONSchema(summaryResponseSchema);

/**
 * POST /api/ace/summarize
 * Generate AI summary with full ACE context for evidence items
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const user = locals.user;
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const raw = await request.json();
		const parsed = aceSummarizeSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { evidenceId, caseId, content, title } = parsed.data;

		// Assemble full ACE context (7 parallel data sources)
		const context = await assembleACEContext({
			query: `Summarize this evidence: ${title || 'Evidence item'}`,
			userId: user.id,
			caseId,
			conversationId: caseId ? `board-${caseId}` : undefined,
			maxTokens: 2000
		});

		// Build the ACE prompt
		const summaryPrompt = `${title ? `Evidence: "${title}"\n\n` : ''}${content ? `Content:\n${content.slice(0, 5000)}\n\n` : ''}Provide a concise legal summary with:
1. Executive summary (2-3 sentences)
2. Key legal insights (3-5 bullet points)
3. Confidence assessment

Format as JSON:
{
  "summary": "Executive summary text",
  "keyInsights": ["Insight 1", "Insight 2", ...],
  "confidence": 0.0-1.0
}`;

		const acePrompt = await buildACEPromptCached(context, summaryPrompt);

		// Call Ollama with ACE-enhanced prompt + Zod-derived structured output
		const response = await ollamaFetch(`${getOllamaGenerationEndpoint()}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma4-rotorquant:latest',
				prompt: `${acePrompt.systemPrompt}\n\n${summaryPrompt}`,
				stream: false,
				format: summaryJsonSchema,
				options: {
					temperature: 0.3,
					num_predict: 512
				}
			}),
			signal: AbortSignal.timeout(30000)
		});

		if (!response.ok) {
			throw new Error('Ollama request failed');
		}

		const data = await response.json();
		const rawResponse = data.response || '';

		// Parse structured output with Zod validation
		let parsedSummary: { summary: string; keyInsights: string[]; confidence: number };
		try {
			const raw = JSON.parse(rawResponse);
			const validated = summaryResponseSchema.safeParse(raw);
			if (validated.success) {
				parsedSummary = validated.data;
			} else {
				parsedSummary = {
					summary: raw.summary ?? rawResponse.trim(),
					keyInsights: Array.isArray(raw.keyInsights) ? raw.keyInsights : [],
					confidence: Number(raw.confidence) || 0.7
				};
			}
		} catch {
			parsedSummary = {
				summary: rawResponse.trim(),
				keyInsights: [],
				confidence: 0.7
			};
		}

		// Return summary + ACE context metadata
		return json({
			summary: parsedSummary.summary || rawResponse,
			keyInsights: parsedSummary.keyInsights || [],
			confidence: parsedSummary.confidence || 0.75,
			aceContext: {
				caseContext: context.caseContext ? true : false,
				ragChunks: context.ragChunks.length,
				kagNeighbors: context.kagNeighbors.length,
				entities: Object.values(context.entities).flat().length,
				practiceArea: context.practiceTemplate ? true : false
			}
		});
	} catch (e) {
		console.error('[api/ace/summarize] Failed:', e);
		return json(
			{ error: 'Summarization failed' },
			{ status: 500 }
		);
	}
};



