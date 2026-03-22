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

/** Tool definitions for Ollama native function calling */
const CONTEXTUAL_TOOLS = [
	{
		type: 'function' as const,
		function: {
			name: 'glossary_search',
			description: 'Search the legal glossary for term definitions and legal concepts. Use when the user asks "what is [term]?", "define [term]", or needs clarification on legal terminology.',
			parameters: {
				type: 'object',
				required: ['query'],
				properties: {
					query: { type: 'string', description: 'Legal term or concept to look up' },
					limit: { type: 'number', description: 'Max results (default: 5)' }
				}
			}
		}
	},
	{
		type: 'function' as const,
		function: {
			name: 'rag_search',
			description: 'Semantic search through legal documents using vector similarity. Use to find relevant evidence, case documents, or legal precedents.',
			parameters: {
				type: 'object',
				required: ['query'],
				properties: {
					query: { type: 'string', description: 'Semantic search query' },
					limit: { type: 'number', description: 'Max results (default: 5)' }
				}
			}
		}
	},
	{
		type: 'function' as const,
		function: {
			name: 'web_search',
			description: 'Search the web for legal research, case law, or documentation.',
			parameters: {
				type: 'object',
				required: ['query'],
				properties: {
					query: { type: 'string', description: 'Search query' },
					maxResults: { type: 'number', description: 'Max results (default: 5)' }
				}
			}
		}
	}
];

/** Execute a contextual tool call and return result string */
async function executeContextualTool(name: string, args: Record<string, unknown>): Promise<string> {
	try {
		switch (name) {
			case 'glossary_search': {
				const { fetchGlossaryMatches } = await import('$lib/server/ace/context-assembler.js');
				const matches = await fetchGlossaryMatches(String(args.query || ''));
				if (!matches || matches.length === 0) return 'No glossary matches found.';
				return matches.slice(0, Number(args.limit ?? 5)).map((m: any) =>
					`**${m.term}**: ${m.definition}${m.category ? ` (${m.category})` : ''}`
				).join('\n\n');
			}
			case 'rag_search': {
				const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');
				const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
				const queryText = String(args.query || '');
				const embResult = await generateEmbeddings([queryText]);
				if (!embResult.vectors[0]?.length) return 'Failed to generate embedding.';
				const searchResult = await qdrant.hybridSearch({
					query: queryText,
					queryEmbedding: embResult.vectors[0],
					collection: 'documents' as any,
					limit: Number(args.limit ?? 5),
					scoreThreshold: 0.5
				});
				return searchResult.results.map((r: any, i: number) =>
					`${i + 1}. [${(r.score * 100).toFixed(0)}%] ${r.payload?.title || 'Untitled'}\n   ${(r.payload?.content || '').slice(0, 200)}`
				).join('\n\n') || 'No relevant documents found.';
			}
			case 'web_search': {
				const { webSearch, formatWebSearchResults } = await import('$lib/server/agent/tools/web-search-searxng.js');
				const result = await webSearch({ query: String(args.query || ''), maxResults: Number(args.maxResults ?? 5), searchType: 'general' });
				return formatWebSearchResults(result);
			}
			default:
				return `Unknown tool: ${name}`;
		}
	} catch {
		return 'Tool execution failed.';
	}
}

/**
 * POST /api/contextual/chat
 * Contextual chat with HMM state tracking + optional agentic tool calling
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

		// Build system prompt
		const systemPrompt = enableFunctions
			? `You are a contextual legal AI assistant with agentic tool-calling capabilities. You have access to these tools:

1. **glossary_search** — Look up legal term definitions, concepts, and terminology
2. **rag_search** — Semantic search through legal documents and evidence
3. **web_search** — Search the web for legal research and case law

Use tools proactively when the user asks about:
- Legal term definitions or meanings → glossary_search
- Finding relevant documents or evidence → rag_search
- External legal information or current law → web_search

Track conversation context and provide structured, well-cited responses.`
			: `You are a helpful legal AI assistant. Provide clear, accurate responses about legal topics. Track conversation context to give relevant follow-up responses.`;

		const messages: Array<{ role: string; content: string }> = [
			{ role: 'system', content: systemPrompt },
			...conversationHistory.slice(-10),
			{ role: 'user', content: message }
		];

		let responseText = '';
		const toolResults: Array<{ tool: string; input: any; output: string }> = [];

		if (enableFunctions) {
			// Agentic mode: Ollama native tool calling with iterative loop
			let maxToolRounds = 2;

			while (maxToolRounds > 0) {
				const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: 'gemma3-legal:latest',
						messages,
						stream: false,
						tools: CONTEXTUAL_TOOLS,
						options: { temperature: 0.3 }
					}),
					signal: AbortSignal.timeout(30_000)
				});

				if (!res.ok) {
					return json({ success: false, error: { message: 'AI service unavailable' } }, { status: 502 });
				}

				const data = await res.json();
				const toolCalls = data.message?.tool_calls;

				if (!toolCalls || toolCalls.length === 0) {
					// No tool calls — this is the final response
					responseText = data.message?.content || '';
					break;
				}

				// Execute each tool call
				messages.push({ role: 'assistant', content: data.message?.content || '' });

				for (const tc of toolCalls) {
					const toolName = tc.function?.name;
					const toolArgs = tc.function?.arguments || {};
					if (!toolName) continue;

					const output = await executeContextualTool(toolName, toolArgs);
					toolResults.push({ tool: toolName, input: toolArgs, output });
					messages.push({ role: 'tool', content: output });
				}

				maxToolRounds--;
			}

			// If we exhausted rounds without a final text response, get one
			if (!responseText) {
				const finalRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
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
				const finalData = finalRes.ok ? await finalRes.json() : null;
				responseText = finalData?.message?.content || 'Tool calls completed but could not generate a final response.';
			}
		} else {
			// Simple mode: no tools, single Ollama call
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
				return json({ success: false, error: { message: 'AI service unavailable' } }, { status: 502 });
			}

			const data = await res.json();
			responseText = data.message?.content || '';
		}

		// Update conversation history + HMM state in Redis
		try {
			const redis = getRedis();
			conversationHistory.push(
				{ role: 'user', content: message },
				{ role: 'assistant', content: responseText }
			);
			await redis.set(
				`contextual:history:${sessionId}`,
				JSON.stringify(conversationHistory.slice(-20)),
				'EX', 3600
			);

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
				model: 'gemma3-legal:latest',
				sessionId,
				...(toolResults.length > 0 && { toolResults })
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
	if (turnIndex === 0 || lower.includes('hello') || lower.includes('hi')) return 0;
	if (lower.includes('case') || lower.includes('lawsuit')) return 1;
	if (lower.includes('document') || lower.includes('evidence') || lower.includes('file')) return 2;
	if (lower.includes('law') || lower.includes('statute') || lower.includes('precedent') || lower.includes('research')) return 3;
	if (lower.includes('risk') || lower.includes('liability') || lower.includes('assessment')) return 4;
	if (lower.includes('recommend') || lower.includes('suggest') || lower.includes('advice')) return 5;
	if (lower.includes('follow') || lower.includes('more') || lower.includes('also')) return 6;
	if (lower.includes('thank') || lower.includes('bye') || lower.includes('done')) return 7;
	return Math.min(turnIndex, 7);
}

/** Simple entity extraction from message text */
function extractEntities(text: string): Array<{ type: string; value: string }> {
	const entities: Array<{ type: string; value: string }> = [];
	const caseNums = text.match(/\d{4}-[A-Z]{2,}-\d+/g);
	if (caseNums) caseNums.forEach(v => entities.push({ type: 'CASE_NUMBER', value: v }));
	const dates = text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi);
	if (dates) dates.forEach(v => entities.push({ type: 'DATE', value: v }));
	const statutes = text.match(/\b\d+ U\.?S\.?C\.? ?\u00A7? ?\d+\b|\bSection \d+/gi);
	if (statutes) statutes.forEach(v => entities.push({ type: 'STATUTE', value: v }));
	const money = text.match(/\$[\d,]+(?:\.\d{2})?/g);
	if (money) money.forEach(v => entities.push({ type: 'MONEY', value: v }));
	return entities;
}
