import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { getRedis } from '$lib/server/redis.js';
import { z } from 'zod';

const contextualChatSchema = z.object({
	message: z.string().min(1).max(10000),
	sessionId: z.string().max(200).optional(),
	userId: z.string().max(200).optional(),
	enableFunctions: z.boolean().optional()
});

/**
 * POST /api/contextual/chat
 * Contextual chat with HMM state tracking + LLM response
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = contextualChatSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ success: false, error: { message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
				{ status: 400 }
			);
		}

		const { message, sessionId = `session-${Date.now()}`, userId = 'anonymous', enableFunctions = false } = parsed.data;

		// Get conversation history from Redis for context
		let conversationHistory: Array<{ role: string; content: string }> = [];
		try {
			const redis = getRedis();
			const cached = await redis.get(`contextual:history:${sessionId}`);
			if (cached) {
				conversationHistory = JSON.parse(cached);
			}
		} catch {
			// Redis unavailable — proceed without history
		}

		// Build system prompt with contextual awareness
		const systemPrompt = enableFunctions
			? `You are a contextual legal AI assistant with agentic capabilities. You can analyze cases, extract entities, assess risk, and provide legal research. Track the conversation context and provide relevant follow-ups. When the user asks about legal matters, extract key entities (names, dates, case numbers, statutes) and provide structured analysis.`
			: `You are a helpful legal AI assistant. Provide clear, accurate responses about legal topics. Track conversation context to give relevant follow-up responses.`;

		const messages = [
			{ role: 'system', content: systemPrompt },
			...conversationHistory.slice(-10), // Last 10 turns for context
			{ role: 'user', content: message }
		];

		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages,
				stream: false,
				options: { temperature: 0.3 }
			}),
			signal: AbortSignal.timeout(30_000)
		});

		if (!res.ok) {
			return json(
				{ success: false, error: { message: 'AI service unavailable' } },
				{ status: 502 }
			);
		}

		const data = await res.json();
		const responseText = data.message?.content || '';

		// Update conversation history in Redis
		try {
			const redis = getRedis();
			conversationHistory.push(
				{ role: 'user', content: message },
				{ role: 'assistant', content: responseText }
			);
			await redis.set(
				`contextual:history:${sessionId}`,
				JSON.stringify(conversationHistory.slice(-20)), // Keep last 20 messages
				'EX', 3600 // 1hr TTL
			);

			// Update HMM state tracking
			const stateIdx = inferHmmState(message, conversationHistory.length);
			const stateData = {
				hmmState: {
					currentState: stateIdx,
					stateHistory: conversationHistory
						.filter(m => m.role === 'user')
						.map((_, i) => inferHmmState('', i)),
					transitionMatrix: []
				},
				confidence: Math.min(0.5 + conversationHistory.length * 0.05, 0.95),
				extractedEntities: extractEntities(message),
				turnCount: Math.floor(conversationHistory.length / 2)
			};
			await redis.set(
				`contextual:state:${sessionId}`,
				JSON.stringify(stateData),
				'EX', 3600
			);
		} catch {
			// Non-blocking
		}

		return json({
			success: true,
			data: {
				response: responseText,
				model: data.model || 'gemma3-legal:latest',
				sessionId
			}
		});
	} catch (err) {
		console.error('[/api/contextual/chat]', err);
		return json(
			{ success: false, error: { message: 'Chat service error' } },
			{ status: 503 }
		);
	}
};

/** Simple HMM state inference based on message content */
function inferHmmState(message: string, turnIndex: number): number {
	const lower = message.toLowerCase();
	if (turnIndex === 0 || lower.includes('hello') || lower.includes('hi')) return 0; // Greeting
	if (lower.includes('case') || lower.includes('lawsuit')) return 1; // Case Inquiry
	if (lower.includes('document') || lower.includes('evidence') || lower.includes('file')) return 2; // Document Analysis
	if (lower.includes('law') || lower.includes('statute') || lower.includes('precedent') || lower.includes('research')) return 3; // Legal Research
	if (lower.includes('risk') || lower.includes('liability') || lower.includes('assessment')) return 4; // Risk Assessment
	if (lower.includes('recommend') || lower.includes('suggest') || lower.includes('advice')) return 5; // Recommendation
	if (lower.includes('follow') || lower.includes('more') || lower.includes('also')) return 6; // Follow-up
	if (lower.includes('thank') || lower.includes('bye') || lower.includes('done')) return 7; // Conclusion
	return Math.min(turnIndex, 7); // Default: progress through states
}

/** Simple entity extraction from message text */
function extractEntities(text: string): Array<{ type: string; value: string }> {
	const entities: Array<{ type: string; value: string }> = [];

	// Case numbers (e.g., 2024-CV-12345)
	const caseNums = text.match(/\d{4}-[A-Z]{2,}-\d+/g);
	if (caseNums) caseNums.forEach(v => entities.push({ type: 'CASE_NUMBER', value: v }));

	// Dates
	const dates = text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi);
	if (dates) dates.forEach(v => entities.push({ type: 'DATE', value: v }));

	// Statute references
	const statutes = text.match(/\b\d+ U\.?S\.?C\.? ?\u00A7? ?\d+\b|\bSection \d+/gi);
	if (statutes) statutes.forEach(v => entities.push({ type: 'STATUTE', value: v }));

	// Money amounts
	const money = text.match(/\$[\d,]+(?:\.\d{2})?/g);
	if (money) money.forEach(v => entities.push({ type: 'MONEY', value: v }));

	return entities;
}
