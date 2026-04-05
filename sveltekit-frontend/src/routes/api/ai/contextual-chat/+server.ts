import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { contextualChat } from '$lib/server/llm/contextual-chat.js';
import { z } from 'zod';

const contextualChatSchema = z.object({
	message: z.string().max(50000).optional(),
	query: z.string().max(50000).optional(),
	caseId: z.string().max(500).optional().default(''),
	sessionId: z.string().max(500).optional(),
	tags: z.array(z.string().max(200)).max(20).optional(),
	jurisdiction: z.string().max(200).optional(),
	sectionTypes: z.array(z.enum([
		'facts', 'issues', 'reasoning', 'holding', 'citations',
		'parties', 'motions', 'bibliography', 'procedural_history',
		'sentencing', 'judgment'
	])).max(11).optional(),
	context: z.string().max(10000).optional().default(''),
	history: z.array(z.object({
		role: z.string().max(50),
		content: z.string().max(50000)
	})).max(50).optional().default([])
}).refine(d => (d.message?.trim() || d.query?.trim()), {
	message: 'Message is required'
});

/** POST /api/ai/contextual-chat — RAG-augmented case-context-aware chat */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const raw = await request.json();
		const parsed = contextualChatSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}

		const message = parsed.data.message || parsed.data.query || '';
		const { caseId, sessionId, tags, jurisdiction, sectionTypes } = parsed.data;

		const result = await contextualChat({
			message,
			caseId: caseId || null,
			sessionId: sessionId || null,
			userId: locals.user?.id ?? null,
			tags: tags ?? null,
			jurisdiction: jurisdiction || null,
			sectionTypes: sectionTypes ?? null,
		});

		return json({
			response: result.answer,
			turnId: result.turnId,
			keywords: result.keywords,
			keyPhrases: result.keyPhrases,
			suggestions: result.suggestions,
			citations: result.citations,
			latencyMs: result.latencyMs,
			model: 'gemma4-legal:latest',
		});
	} catch (err) {
		console.error('[ai/contextual-chat] Error:', err);
		return json({ error: 'AI service unavailable' }, { status: 503 });
	}
};