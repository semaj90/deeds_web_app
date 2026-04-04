/**
 * Shared contextual tool definitions and executor for agentic chat endpoints.
 * Used by /api/sse/chat and /api/contextual/chat.
 */
import {
	completeToolParameters,
	shouldUseWebSearchFallback,
	type ToolExecutionPolicyContext,
} from '$lib/server/ace/policy.js';

export interface ContextualToolResult {
	ok: boolean;
	tool: string;
	result: string;
	durationMs: number;
	metadata?: Record<string, unknown>;
}

/** Ollama native function-calling tool definitions */
export const CONTEXTUAL_TOOLS = [
	{
		type: 'function' as const,
		function: {
			name: 'glossary_search',
			description:
				'Search the legal glossary for term definitions and legal concepts. Use when the user asks "what is [term]?", "define [term]", or needs clarification on legal terminology.',
			parameters: {
				type: 'object',
				required: ['query'],
				properties: {
					query: { type: 'string', description: 'Legal term or concept to look up' },
					limit: { type: 'number', description: 'Max results (default: 5)' },
				},
			},
		},
	},
	{
		type: 'function' as const,
		function: {
			name: 'rag_search',
			description:
				'Semantic search through legal documents using vector similarity. Use to find relevant evidence, case documents, or legal precedents.',
			parameters: {
				type: 'object',
				required: ['query'],
				properties: {
					query: { type: 'string', description: 'Semantic search query' },
					limit: { type: 'number', description: 'Max results (default: 5)' },
				},
			},
		},
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
					maxResults: { type: 'number', description: 'Max results (default: 5)' },
				},
			},
		},
	},
	{
		type: 'function' as const,
		function: {
			name: 'graph_expand',
			description:
				'Expand retrieval using the knowledge graph. Given an evidence or case ID, find related documents through graph connections (KAG neighbors). Use when the user asks about related evidence, connections between documents, or wants to explore relationships.',
			parameters: {
				type: 'object',
				required: ['caseId'],
				properties: {
					caseId: { type: 'string', description: 'Case UUID to expand graph from' },
					limit: { type: 'number', description: 'Max neighbors (default: 8)' },
				},
			},
		},
	},
	{
		type: 'function' as const,
		function: {
			name: 'authority_drill',
			description:
				'Drill down into cited statutes and case precedents. Given a legal citation or statute reference, find the full text and related authorities. Use when the user asks about specific statutes, precedents, or wants deeper analysis of cited law.',
			parameters: {
				type: 'object',
				required: ['query'],
				properties: {
					query: { type: 'string', description: 'Statute code, case citation, or legal concept to drill into' },
					maxHops: { type: 'number', description: 'Max citation hops (default: 2)' },
				},
			},
		},
	},
	{
		type: 'function' as const,
		function: {
			name: 'case_search',
			description:
				'Search for similar cases by description or legal issue. Returns matching cases with similarity scores. Use when the user asks to find related cases, similar precedents, or case patterns.',
			parameters: {
				type: 'object',
				required: ['query'],
				properties: {
					query: { type: 'string', description: 'Case description or legal issue to search for' },
					limit: { type: 'number', description: 'Max results (default: 5)' },
				},
			},
		},
	},
] as const;

const TOOL_TIMEOUT_MS: Record<string, number> = {
	glossary_search: 3_000,
	rag_search: 6_000,
	web_search: 8_000,
	graph_expand: 6_000,
	authority_drill: 8_000,
	case_search: 6_000,
};

/** Execute a contextual tool call and return a normalized result */
export async function executeContextualTool(
	name: string,
	args: Record<string, unknown>,
	policyContext: ToolExecutionPolicyContext = {}
): Promise<ContextualToolResult> {
	const start = Date.now();
	const timeout = TOOL_TIMEOUT_MS[name] ?? 5_000;
	const completion = completeToolParameters(name, args, policyContext);
	args = completion.args;
	const metadata = {
		parameterCompletion: completion,
		retrievalConfidence: policyContext.retrievalConfidence ?? null,
	};
	if (name === 'web_search' && !shouldUseWebSearchFallback(policyContext.retrievalConfidence)) {
		return {
			ok: true,
			tool: name,
			result: 'Skipped web search because local retrieval confidence was already sufficient.',
			durationMs: Date.now() - start,
			metadata,
		};
	}
	if (completion.missing.length > 0) {
		return {
			ok: false,
			tool: name,
			result: `Missing required parameter(s): ${completion.missing.join(', ')}`,
			durationMs: Date.now() - start,
			metadata,
		};
	}
	try {
		switch (name) {
			case 'glossary_search': {
				const { fetchGlossaryMatches } = await import('$lib/server/ace/context-assembler.js');
				const matches = (await Promise.race([
					fetchGlossaryMatches(String(args.query || '')),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), timeout)
					),
				])) as Awaited<ReturnType<typeof fetchGlossaryMatches>>;
				if (!matches || matches.length === 0)
					return {
						ok: true,
						tool: name,
						result: 'No glossary matches found.',
						durationMs: Date.now() - start,
						metadata,
					};
				const result = matches
					.slice(0, Number(args.limit ?? 5))
					.map(
						(m: Record<string, any>) =>
							`**${m.term}**: ${m.definition.slice(0, 300)}${m.category ? ` (${m.category})` : ''}`
					)
					.join('\n\n');
				return { ok: true, tool: name, result, durationMs: Date.now() - start, metadata };
			}
			case 'rag_search': {
				const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');
				const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
				const queryText = String(args.query || '');
				const embResult = (await Promise.race([
					generateEmbeddings([queryText]),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), timeout)
					),
				])) as Awaited<ReturnType<typeof generateEmbeddings>>;
				if (!embResult.vectors[0]?.length)
					return {
						ok: false,
						tool: name,
						result: 'Failed to generate embedding.',
						durationMs: Date.now() - start,
						metadata,
					};
				const searchResult = await qdrant.hybridSearch({
					query: queryText,
					queryEmbedding: embResult.vectors[0],
					collection: 'documents' as string,
					limit: Number(args.limit ?? 3),
					scoreThreshold: 0.5,
				});
				const result =
					searchResult.results
						.map(
							(r: Record<string, any>, i: number) =>
								`${i + 1}. [${(r.score * 100).toFixed(0)}%] ${r.payload?.title || 'Untitled'}\n   ${(r.payload?.content || '').slice(0, 150)}`
						)
						.join('\n\n') || 'No relevant documents found.';
				return { ok: true, tool: name, result, durationMs: Date.now() - start, metadata };
			}
			case 'web_search': {
				const { webSearch, formatWebSearchResults } = await import(
					'$lib/server/agent/tools/web-search-searxng.js'
				);
				const searchResult = await Promise.race([
					webSearch({
						query: String(args.query || ''),
						maxResults: Number(args.maxResults ?? 5),
						searchType: 'general',
					}),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), timeout)
					),
				]);
				return {
					ok: true,
					tool: name,
					result: formatWebSearchResults(
						searchResult as Awaited<ReturnType<typeof webSearch>>
					),
					durationMs: Date.now() - start,
					metadata,
				};
			}
			case 'graph_expand': {
				const { getCaseGraphNeighborIds } = await import(
					'$lib/server/retrieval/graph-context.js'
				);
				const caseId = String(args.caseId || '');
				if (!caseId)
					return { ok: false, tool: name, result: 'Missing caseId', durationMs: Date.now() - start, metadata };
				const neighbors = await Promise.race([
					getCaseGraphNeighborIds(caseId),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), timeout)
					),
				]);
				if (!neighbors || (neighbors as any[]).length === 0)
					return { ok: true, tool: name, result: 'No graph neighbors found for this case.', durationMs: Date.now() - start, metadata };
				const graphLimit = Number(args.limit ?? 8);
				const graphResult = (neighbors as any[])
					.slice(0, graphLimit)
					.map((n: any) => `- **${n.title || n.nodeId}** (${n.relationship || 'related'})${n.score ? ` — strength: ${Number(n.score).toFixed(2)}` : ''}`)
					.join('\n');
				return { ok: true, tool: name, result: `## Graph Neighbors (${(neighbors as any[]).length} found)\n${graphResult}`, durationMs: Date.now() - start, metadata };
			}
			case 'authority_drill': {
				const { authorityChainExpansion } = await import(
					'$lib/server/retrieval/authority-chain.js'
				);
				const { generateEmbeddings: genEmbed } = await import('$lib/server/grpc/embedding-client.js');
				const { ENV: env } = await import('$lib/server/env.server.js');
				const authQuery = String(args.query || '');
				if (!authQuery)
					return { ok: false, tool: name, result: 'Missing query', durationMs: Date.now() - start, metadata };
				const authEmb = await Promise.race([
					genEmbed([authQuery]),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), timeout)
					),
				]) as Awaited<ReturnType<typeof genEmbed>>;
				if (!authEmb.vectors[0]?.length)
					return { ok: false, tool: name, result: 'Failed to generate embedding.', durationMs: Date.now() - start, metadata };
				const embedFn = async (text: string) => {
					const r = await genEmbed([text]);
					return r.vectors[0] ?? null;
				};
				const seedDocs = [{ content: authQuery, similarity: 1.0, documentId: 'query' }];
				const authResult = await authorityChainExpansion(
					authEmb.vectors[0],
					seedDocs,
					embedFn,
					{ qdrantUrl: env.QDRANT_URL, maxHops: Number(args.maxHops ?? 2) }
				);
				if (authResult.expanded === 0)
					return { ok: true, tool: name, result: 'No authority sources found for this citation.', durationMs: Date.now() - start, metadata };
				const authLines = authResult.docs
					.filter((d: any) => d.documentId !== 'query')
					.slice(0, 6)
					.map((d: any, i: number) => `${i + 1}. [${(d.similarity * 100).toFixed(0)}%] ${d.content.slice(0, 300)}`)
					.join('\n\n');
				const statutes = authResult.authorities.statutes.join(', ') || 'none';
				const cases = authResult.authorities.cases.join(', ') || 'none';
				return {
					ok: true,
					tool: name,
					result: `## Authority Chain (${authResult.hops} hop(s), ${authResult.expanded} sources)\nStatutes: ${statutes}\nCases: ${cases}\n\n${authLines}`,
					durationMs: Date.now() - start,
					metadata,
				};
			}
			case 'case_search': {
				const { generateEmbeddings: genEmbCS } = await import('$lib/server/grpc/embedding-client.js');
				const { ENV: envCS } = await import('$lib/server/env.server.js');
				const csQuery = String(args.query || '');
				if (!csQuery)
					return { ok: false, tool: name, result: 'Missing query', durationMs: Date.now() - start, metadata };
				const csEmb = await Promise.race([
					genEmbCS([csQuery]),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), timeout)
					),
				]) as Awaited<ReturnType<typeof genEmbCS>>;
				if (!csEmb.vectors[0]?.length)
					return { ok: false, tool: name, result: 'Failed to generate embedding.', durationMs: Date.now() - start, metadata };
				const searchRes = await fetch(`${envCS.QDRANT_URL}/collections/legal_cases/points/search`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						vector: csEmb.vectors[0],
						limit: Number(args.limit ?? 5),
						with_payload: true,
						score_threshold: 0.3,
					}),
					signal: AbortSignal.timeout(5000),
				});
				if (!searchRes.ok)
					return { ok: false, tool: name, result: 'Case search failed.', durationMs: Date.now() - start, metadata };
				const csData = await searchRes.json();
				const csResults = csData.result ?? [];
				if (csResults.length === 0)
					return { ok: true, tool: name, result: 'No similar cases found.', durationMs: Date.now() - start, metadata };
				const csLines = csResults
					.slice(0, Number(args.limit ?? 5))
					.map((r: any, i: number) => {
						const p = r.payload || {};
						return `${i + 1}. [${(r.score * 100).toFixed(0)}%] **${p.title || p.case_title || 'Untitled'}**${p.jurisdiction ? ` (${p.jurisdiction})` : ''}${p.status ? ` — ${p.status}` : ''}\n   ${(p.description || p.content || '').slice(0, 200)}`;
					})
					.join('\n\n');
				return { ok: true, tool: name, result: `## Similar Cases (${csResults.length} found)\n${csLines}`, durationMs: Date.now() - start, metadata };
			}
			default:
				return {
					ok: false,
					tool: name,
					result: `Unknown tool: ${name}`,
					durationMs: Date.now() - start,
					metadata,
				};
		}
	} catch {
		return {
			ok: false,
			tool: name,
			result: `[${name} failed]`,
			durationMs: Date.now() - start,
			metadata,
		};
	}
}

/**
 * Run a pre-stream tool-detection pass via Ollama native function calling.
 * Returns tool results as context strings to inject into the system prompt.
 * Max 2 rounds, 3 total tool calls. Returns empty array if no tools needed.
 */
export async function runToolDetectionPass(
	ollamaUrl: string,
	modelName: string,
	systemPrompt: string,
	conversationHistory: Array<{ role: string; content: string }>,
	userMessage: string,
	keepAlive: string,
	policyContext: ToolExecutionPolicyContext = {}
): Promise<ContextualToolResult[]> {
	const MAX_TOOL_ROUNDS = 2;
	const MAX_TOTAL_TOOL_CALLS = 3;
	let toolRounds = 0;
	let totalToolCalls = 0;
	const allResults: ContextualToolResult[] = [];

	const messages: Array<{ role: string; content: string }> = [
		{ role: 'system', content: systemPrompt },
		...conversationHistory.slice(-10),
		{ role: 'user', content: userMessage },
	];

	const { ollamaFetch } = await import('$lib/server/ollama.js');

	while (toolRounds < MAX_TOOL_ROUNDS) {
		let res: Response;
		try {
			res = await ollamaFetch(`${ollamaUrl}/api/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: modelName,
					messages,
					stream: false,
					tools: CONTEXTUAL_TOOLS,
					keep_alive: keepAlive,
					options: {
						temperature: 0.1,
						top_k: 20,
						top_p: 0.8,
						num_ctx: 2048,
						num_predict: 128,
					},
				}),
				signal: AbortSignal.timeout(8_000),
			});
		} catch {
			// Timeout or network error — abort tool detection silently
			break;
		}

		if (!res.ok) break;

		let data: any;
		try {
			data = await res.json();
		} catch {
			break;
		}
		const toolCalls = data.message?.tool_calls;

		if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) break;

		messages.push({ role: 'assistant', content: data.message?.content || '' });

		for (const tc of toolCalls) {
			if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) break;
			const toolName = tc.function?.name;
			const toolArgs = tc.function?.arguments || {};
			if (!toolName) continue;

			const tr = await executeContextualTool(toolName, toolArgs, {
				...policyContext,
				message: policyContext.message ?? userMessage,
			});
			allResults.push(tr);
			totalToolCalls++;
			messages.push({ role: 'tool', content: tr.result });
		}

		toolRounds++;
	}

	return allResults;
}
