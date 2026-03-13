import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';

const agentChatSchema = z.object({
	prompt: z.string().max(10000).optional(),
	message: z.string().max(10000).optional()
}).refine(d => (d.prompt?.trim() || d.message?.trim()), {
	message: 'Either prompt or message is required'
});

/** Ollama tool definitions for native function calling */
const AGENT_TOOLS = [
	{
		type: 'function' as const,
		function: {
			name: 'web_search',
			description: 'Search the web for legal research, documentation, case law, statutes, or general information. Use this when the user asks about external knowledge, current law, or needs information beyond the casebase.',
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
			description: 'Search the codebase or project files for patterns using regex. Use this to find specific code, evidence references, file contents, or text patterns across the project.',
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
	{
		type: 'function' as const,
		function: {
			name: 'rag_search',
			description: 'Semantic search through the legal document database using vector similarity. Use this to find relevant evidence, case documents, legal precedents, or similar content based on meaning.',
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
	}
];

/** Execute a tool call and return the result as a string */
async function executeTool(name: string, args: Record<string, unknown>): Promise<{ result: string; duration: number }> {
	const start = Date.now();
	try {
		switch (name) {
			case 'web_search': {
				const { webSearch, formatWebSearchResults } = await import('$lib/server/agent/tools/web-search-searxng.js');
				const searchResult = await webSearch({
					query: String(args.query || ''),
					maxResults: Number(args.maxResults ?? 5),
					searchType: (args.searchType as 'general' | 'stackoverflow' | 'github' | 'docs') || 'general'
				});
				return { result: formatWebSearchResults(searchResult), duration: Date.now() - start };
			}
			case 'ripgrep_search': {
				const { ripgrepSearch, formatRipgrepResults } = await import('$lib/server/agent/tools/ripgrep-search.js');
				const rgResult = await ripgrepSearch({
					pattern: String(args.pattern || ''),
					fileType: args.fileType ? String(args.fileType) : undefined,
					ignoreCase: Boolean(args.ignoreCase ?? false),
					maxResults: Number(args.maxResults ?? 20)
				});
				return { result: formatRipgrepResults(rgResult), duration: Date.now() - start };
			}
			case 'rag_search': {
				const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');
				const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
				const queryText = String(args.query || '');
				const embResult = await generateEmbeddings([queryText]);
				if (!embResult.vectors[0]?.length) {
					return { result: 'Failed to generate embedding for query.', duration: Date.now() - start };
				}
				const collection = (args.collection as string) || 'documents';
				const searchResult = await qdrant.hybridSearch({
					query: queryText,
					queryEmbedding: embResult.vectors[0],
					collection: collection as any,
					limit: Number(args.limit ?? 5),
					scoreThreshold: 0.5
				});
				const formatted = searchResult.results.map((r: any, i: number) =>
					`${i + 1}. [${(r.score * 100).toFixed(0)}% match] ${r.payload?.title || r.payload?.filename || 'Untitled'}\n   ${(r.payload?.content_preview || r.payload?.content || '').slice(0, 200)}`
				).join('\n\n');
				return {
					result: formatted || 'No relevant documents found.',
					duration: Date.now() - start
				};
			}
			default:
				return { result: `Unknown tool: ${name}`, duration: Date.now() - start };
		}
	} catch (err) {
		return { result: `Tool error: ${err instanceof Error ? err.message : String(err)}`, duration: Date.now() - start };
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
				content: `You are an AI agent assistant for a legal investigation platform. You have access to these tools:

1. **web_search** — Search the web for legal research, case law, statutes, documentation
2. **ripgrep_search** — Search project files for patterns (code, evidence references, text)
3. **rag_search** — Semantic search through the legal document database

Use tools proactively when the user's question requires:
- External knowledge or current legal information → web_search
- Finding specific content in files → ripgrep_search
- Finding similar or related documents → rag_search

Provide structured, actionable responses with confidence levels where appropriate. When citing tool results, include the relevance score.`
			},
			{ role: 'user', content: prompt }
		];

		const toolResults: Array<{ tool: string; input: any; output: string; duration: number }> = [];
		let maxToolRounds = 3; // Prevent infinite tool loops

		// Iterative tool calling loop
		while (maxToolRounds > 0) {
			const chatRes = await fetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'gemma3-legal:latest',
					messages,
					stream: false,
					tools: AGENT_TOOLS,
					options: { temperature: 0.5 }
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
				// No tool calls — return final response
				return json({
					response: data.message?.content || '',
					toolResults,
					model: 'gemma3-legal:latest'
				});
			}

			// Execute all tool calls
			messages.push({ role: 'assistant', content: data.message?.content || '' });

			for (const tc of toolCalls) {
				const toolName = tc.function?.name;
				const toolArgs = tc.function?.arguments || {};
				if (!toolName) continue;

				const { result, duration } = await executeTool(toolName, toolArgs);
				toolResults.push({ tool: toolName, input: toolArgs, output: result, duration });

				// Add tool result to conversation
				messages.push({ role: 'tool', content: result });
			}

			maxToolRounds--;
		}

		// Exhausted tool rounds — get final response
		const finalRes = await fetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages,
				stream: false,
				options: { temperature: 0.5 }
			}),
			signal: AbortSignal.timeout(30_000)
		});

		const finalData = finalRes.ok ? await finalRes.json() : null;
		return json({
			response: finalData?.message?.content || 'Agent completed tool calls but could not generate a final response.',
			toolResults,
			model: 'gemma3-legal:latest'
		});
	} catch (err) {
		console.error('[/api/agents/chat]', err);
		return json({ error: 'Agent chat failed' }, { status: 503 });
	}
};
