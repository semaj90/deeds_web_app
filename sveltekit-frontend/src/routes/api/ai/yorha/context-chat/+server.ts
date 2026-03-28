/**
 * POST /api/ai/yorha/context-chat
 *
 * Context-aware chat endpoint for the terminal YorHA interface.
 * Sends message to Ollama with optional case context injection.
 *
 * Request: { sessionId, userId, caseId?, message }
 * Response: { response, context: { keywords, keyPhrases, suggestions } }
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

const yorhaChatSchema = z.object({
	message: z.string().trim().min(1, 'Missing message').max(50000),
	caseId: z.string().max(500).nullable().optional()
});

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const MODEL = 'gemma3-legal:latest';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = yorhaChatSchema.safeParse(await request.json());
	if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	const message = parsed.data.message;
	const caseId = parsed.data.caseId ?? null;

	// Build prompt with optional case context
	let systemPrompt = 'You are YorHA, a legal AI assistant. Provide concise, accurate legal analysis.';
	if (caseId) {
		try {
			const { db } = await import('$lib/server/db/client');
			const { sql } = await import('drizzle-orm');
			const rows = await db.execute(
				sql`SELECT title, description, jurisdiction, court, status FROM cases WHERE id = ${caseId} LIMIT 1`
			);
			const c = (rows as any).rows[0] as Record<string, unknown> | undefined;
			if (c) {
				systemPrompt += `\n\nActive Case: ${c.title ?? 'Unknown'}`;
				if (c.jurisdiction) systemPrompt += ` | Jurisdiction: ${c.jurisdiction}`;
				if (c.court) systemPrompt += ` | Court: ${c.court}`;
				if (c.status) systemPrompt += ` | Status: ${c.status}`;
				if (c.description) systemPrompt += `\nDescription: ${String(c.description).slice(0, 500)}`;
			}
		} catch {
			// DB unavailable — proceed without context
		}
	}

	try {
		const res = await ollamaFetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: MODEL,
				prompt: message,
				system: systemPrompt,
				stream: false,
				options: { temperature: 0.7, num_predict: 1024 }
			}),
			signal: AbortSignal.timeout(30000)
		});

		if (!res.ok) {
			return json({ response: 'AI service unavailable. Please try again.', context: {} }, { status: 503 });
		}

		const data = await res.json();
		const responseText = String(data.response ?? '');

		// Extract basic context from the response
		const keywords = extractKeywords(responseText);
		const keyPhrases = extractKeyPhrases(responseText);

		return json({
			response: responseText,
			context: {
				keywords,
				keyPhrases,
				suggestions: generateSuggestions(message),
				model: MODEL,
				totalDuration: data.total_duration ? Math.round(data.total_duration / 1e6) : null
			}
		});
	} catch (err) {
		console.error('[YorHA Context Chat] Error:', err);
		return json({
			response: 'Connection to AI service timed out. Check that Ollama is running.',
			context: {}
		}, { status: 503 });
	}
};

function extractKeywords(text: string): string[] {
	const legalTerms = [
		'jurisdiction', 'statute', 'precedent', 'plaintiff', 'defendant', 'motion',
		'evidence', 'testimony', 'verdict', 'appeal', 'counsel', 'discovery',
		'deposition', 'subpoena', 'indictment', 'arraignment', 'bail', 'sentence',
		'probation', 'parole', 'felony', 'misdemeanor', 'tort', 'liability',
		'damages', 'negligence', 'contract', 'breach', 'remedy', 'injunction'
	];
	const lower = text.toLowerCase();
	return legalTerms.filter((t) => lower.includes(t)).slice(0, 8);
}

function extractKeyPhrases(text: string): string[] {
	const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 20);
	return sentences
		.slice(0, 3)
		.map((s) => s.trim().slice(0, 100));
}

function generateSuggestions(query: string): string[] {
	const lower = query.toLowerCase();
	const suggestions: string[] = [];
	if (lower.includes('case') || lower.includes('evidence')) {
		suggestions.push('Search related evidence');
		suggestions.push('Find similar cases');
	}
	if (lower.includes('statute') || lower.includes('law')) {
		suggestions.push('Search statutes database');
		suggestions.push('Find precedent rulings');
	}
	if (suggestions.length === 0) {
		suggestions.push('Analyze legal implications');
		suggestions.push('Search knowledge base');
	}
	return suggestions;
}