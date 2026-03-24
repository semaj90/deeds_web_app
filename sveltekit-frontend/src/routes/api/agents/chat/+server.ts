import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

const agentChatSchema = z.object({
	prompt: z.string().max(10000).optional(),
	message: z.string().max(10000).optional()
}).refine(d => (d.prompt?.trim() || d.message?.trim()), {
	message: 'Either prompt or message is required'
});

/** Ollama tool definitions — ordered by lookup priority: glossary → rag → web → ripgrep */
const AGENT_TOOLS = [
	{
		type: 'function' as const,
		function: {
			name: 'glossary_search',
			description: 'Search the legal glossary for term definitions, legal concepts, and terminology. PREFER THIS FIRST for any question asking "what is [term]?", "define [term]", meaning of legal language, statutes, or concepts before using web or RAG search.',
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
			description: 'Semantic search through the legal document database using vector similarity. Use to find relevant evidence, case documents, or legal precedents. Prefer glossary_search first for simple definitions.',
			parameters: {
				type: 'object',
				required: ['query'],
				properties: {
					query: { type: 'string', description: 'Semantic search query' },
					collection: {
						type: 'string',
						enum: ['documents', 'evidence', 'chat_history'],
						description: 'Which collection to search (default: documents)'
					},
					limit: { type: 'number', description: 'Max results (default: 5)' }
				}
			}
		}
	},
	{
		type: 'function' as const,
		function: {
			name: 'web_search',
			description: 'Search the web for current legal information, case law, or documentation. Use only when glossary and RAG searches cannot answer the question or when up-to-date external information is needed.',
			parameters: {
				type: 'object',
				required: ['query'],
				properties: {
					query: { type: 'string', description: 'Search query' },
					searchType: {
						type: 'string',
						enum: ['general', 'stackoverflow', 'github', 'docs'],
						description: 'Type of search (default: general)'
					},
					maxResults: { type: 'number', description: 'Max results to return (default: 5)' }
				}
			}
		}
	},
	{
		type: 'function' as const,
		function: {
			name: 'ripgrep_search',
			description: 'Search the codebase or project files for patterns using regex. Use for finding specific code, evidence references, or text patterns across project files.',
			parameters: {
				type: 'object',
				required: ['pattern'],
				properties: {
					pattern: { type: 'string', description: 'Regex pattern to search for' },
					fileType: { type: 'string', description: 'File type filter (ts, svelte, md, etc.)' },
					ignoreCase: { type: 'boolean', description: 'Case-insensitive search' },
					maxResults: { type: 'number', description: 'Max matches (default: 20)' }
				}
			}
		}
	},
];

/** Unified tool result shape — all tools return this so synthesis prompt stays stable */
interface ToolResult {
	ok: boolean;
	tool: string;
	query: string;
	results: string;
	count: number;
	durationMs: number;
}

const TOOL_TIMEOUT_MS: Record<string, number> = {
	web_search: 8_000,
	ripgrep_search: 5_000,
	rag_search: 6_000,
	glossary_search: 3_000,
};

/** Execute a tool call and return a normalised ToolResult */
async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
	const start = Date.now();
	const query = String(args.query || args.pattern || '');
	try {
		const timeout = TOOL_TIMEOUT_MS[name] ?? 5_000;
		switch (name) {
			case 'web_search': {
				const { webSearch, formatWebSearchResults } = await import('$lib/server/agent/tools/web-search-searxng.js');
				const searchResult = await Promise.race([
					webSearch({ query, maxResults: Number(args.maxResults ?? 5), searchType: (args.searchType as 'general' | 'stackoverflow' | 'github' | 'docs') || 'general' }),
					new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
				]);
				const results = formatWebSearchResults(searchResult as Awaited<ReturnType<typeof webSearch>>);
				return { ok: true, tool: name, query, results, count: (searchResult as any).results?.length ?? 0, durationMs: Date.now() - start };
			}
			case 'ripgrep_search': {
				const { ripgrepSearch, formatRipgrepResults } = await import('$lib/server/agent/tools/ripgrep-search.js');
				const rgResult = await Promise.race([
					ripgrepSearch({ pattern: String(args.pattern || ''), fileType: args.fileType ? String(args.fileType) : undefined, ignoreCase: Boolean(args.ignoreCase ?? false), maxResults: Number(args.maxResults ?? 20) }),
					new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
				]);
				const results = formatRipgrepResults(rgResult as Awaited<ReturnType<typeof ripgrepSearch>>);
				return { ok: true, tool: name, query, results, count: (rgResult as any).matches?.length ?? 0, durationMs: Date.now() - start };
			}
			case 'rag_search': {
				const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');
				const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
				const embResult = await Promise.race([
					generateEmbeddings([query]),
					new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
				]);
				if (!(embResult as any).vectors[0]?.length)
					return { ok: false, tool: name, query, results: 'Embedding failed.', count: 0, durationMs: Date.now() - start };
				const collection = (args.collection as string) || 'documents';
				const searchResult = await qdrant.hybridSearch({ query, queryEmbedding: (embResult as any).vectors[0], collection: collection as any, limit: Number(args.limit ?? 5), scoreThreshold: 0.5 });
				const results = searchResult.results.map((r: any, i: number) =>
					`${i + 1}. [${(r.score * 100).toFixed(0)}%] ${r.payload?.title || r.payload?.filename || 'Untitled'}\n   ${(r.payload?.content_preview || r.payload?.content || '').slice(0, 200)}`
				).join('\n\n') || 'No relevant documents found.';
				return { ok: true, tool: name, query, results, count: searchResult.results.length, durationMs: Date.now() - start };
			}
			case 'glossary_search': {
				const { fetchGlossaryMatches } = await import('$lib/server/ace/context-assembler.js');
				const matches = await Promise.race([
					fetchGlossaryMatches(query),
					new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
				]) as Awaited<ReturnType<typeof fetchGlossaryMatches>>;
				if (!matches || matches.length === 0)
					return { ok: true, tool: name, query, results: 'No glossary matches found for that term.', count: 0, durationMs: Date.now() - start };
				const cap = Number(args.limit ?? 5);
				const results = matches.slice(0, cap).map((m: any, i: number) => {
					const meta = [m.category, m.jurisdiction].filter(Boolean).join(' | ');
					return `${i + 1}. **${m.term}**: ${m.definition.slice(0, 300)}${meta ? ` (${meta})` : ''}`;
				}).join('\n\n');
				return { ok: true, tool: name, query, results, count: matches.length, durationMs: Date.now() - start };
			}
			default:
				return { ok: false, tool: name, query, results: `Unknown tool: ${name}`, count: 0, durationMs: Date.now() - start };
		}
	} catch (err) {
		// Tool failed — return structured error so synthesis can continue without aborting
		const msg = err instanceof Error ? err.message : 'unknown error';
		return { ok: false, tool: name, query, results: `[${name} failed: ${msg}]`, count: 0, durationMs: Date.now() - start };
	}
}

/** POST /api/agents/chat — Agent chat with Ollama native tool calling (web search + ripgrep + RAG) */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = agentChatSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const prompt = parsed.data.prompt || parsed.data.message || '';

		const messages: Array<{ role: string; content: string }> = [
			{
				role: 'system',
				content: `You are an AI agent assistant for a legal investigation platform.

Tool priority order (MUST follow):
1. **glossary_search** — ALWAYS try this first for any question about legal term definitions, meanings, or concepts (e.g. "what is probable cause?", "define hearsay", "explain mens rea")
2. **rag_search** — Use for finding relevant documents, evidence, or case precedents; also fall back here if glossary has no result
3. **web_search** — Use only for up-to-date external information (current statutes, recent case law) that glossary and RAG cannot answer
4. **ripgrep_search** — Use for searching project code or files for specific patterns

Rules:
- For definition-style questions, call glossary_search before any other tool
- If glossary returns 0 results, escalate to rag_search, then web_search
- Provide structured, actionable responses with citations where appropriate
- When citing tool results, include the relevance score`
			},
			{ role: 'user', content: prompt }
		];

		const toolResults: Array<ToolResult> = [];
		let toolRounds = 0;
		const MAX_TOOL_ROUNDS = 3;
		const MAX_TOTAL_TOOL_CALLS = 4;
		let totalToolCalls = 0;

		// Iterative tool calling loop
		while (toolRounds < MAX_TOOL_ROUNDS) {
			const chatRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'gemma3-legal:latest',
					messages,
					stream: false,
					tools: AGENT_TOOLS,
					options: { temperature: 0.1, top_k: 20, top_p: 0.8, num_ctx: 8192, repeat_penalty: 1.05 }
				}),
				signal: AbortSignal.timeout(60_000)
			});

			if (!chatRes.ok) {
				return json({ error: 'Agent service unavailable' }, { status: 502 });
			}

			const data = await chatRes.json();

			// Check if LLM wants to call tools
			const toolCalls = data.message?.tool_calls;
			if (!toolCalls || toolCalls.length === 0) {
				// No tool calls — return final response with trace
				return json({
					response: data.message?.content || '',
					toolResults,
					model: 'gemma3-legal:latest',
					_trace: { toolRounds, totalToolCalls, toolLatencyMs: toolResults.reduce((s, r) => s + r.durationMs, 0) }
				});
			}

			// Execute all tool calls (respecting hard cap)
			messages.push({ role: 'assistant', content: data.message?.content || '' });

			for (const tc of toolCalls) {
				if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) break;
				const toolName = tc.function?.name;
				const toolArgs = tc.function?.arguments || {};
				if (!toolName) continue;

				const tr = await executeTool(toolName, toolArgs);
				toolResults.push(tr);
				totalToolCalls++;
				// Always append — if tool failed, structured error in results lets model synthesise gracefully
				messages.push({ role: 'tool', content: tr.results });
			}

			toolRounds++;
		}

		// Exhausted tool rounds — get final response with trace
		const finalRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages,
				stream: false,
				options: { temperature: 0.1, top_k: 20, top_p: 0.8, num_ctx: 8192, repeat_penalty: 1.05 }
			}),
			signal: AbortSignal.timeout(30_000)
		});

		const finalData = finalRes.ok ? await finalRes.json() : null;
		return json({
			response: finalData?.message?.content || 'Agent completed tool calls but could not generate a final response.',
			toolResults,
			model: 'gemma3-legal:latest',
			_trace: { toolRounds, totalToolCalls, toolLatencyMs: toolResults.reduce((s, r) => s + r.durationMs, 0) }
		});
	} catch (err) {
		console.error('[/api/agents/chat]', err);
		return json({ error: 'Agent chat failed' }, { status: 503 });
	}
};
