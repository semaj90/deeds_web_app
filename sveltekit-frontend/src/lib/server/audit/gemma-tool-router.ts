/**
 * Gemma 4 Tool Router for GPU Audit Operations
 *
 * Lets Gemma 4 plan, execute, and explain codebase audit results via native
 * function calling. The model selects which audit tools to run based on the
 * user's query, then synthesizes a readable understanding report.
 *
 * Available tools:
 *   - run_gpu_audit: Full Neo4j + LibTorch + Qdrant unified audit
 *   - analyze_graph: Neo4j PageRank + community detection only
 *   - search_codebase: Query codebase vectors via Qdrant similarity
 *   - get_audit_report: Retrieve latest persisted audit report
 *   - gpu_status: Check CUDA availability and VRAM
 *
 * Pattern follows contextual-tools.ts: OpenAI-compatible tool definitions,
 * Zod validation, switch/case executor, multi-round tool-calling loop.
 */

import { z } from 'zod';
import { ollamaFetch, VLM_MODELS } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';

// ── Tool Definitions (OpenAI-compatible format for Ollama) ────────────

export const AUDIT_TOOLS = [
	{
		type: 'function' as const,
		function: {
			name: 'run_gpu_audit',
			description:
				'Run a full GPU-accelerated codebase audit combining Neo4j graph algorithms (PageRank, community detection) with LibTorch CUDA (similarity matrix, K-means clustering) on Qdrant codebase vectors. Returns central files, communities, near-duplicates, and code clusters. Persists report to Postgres.',
			parameters: {
				type: 'object',
				properties: {
					caseId: { type: 'string', description: 'Optional case UUID to scope the graph analysis' },
					maxNodes: { type: 'number', description: 'Max Neo4j nodes to analyze (default: 500)' },
					clusterCount: { type: 'number', description: 'K-means cluster count (default: auto)' },
					maxVectors: { type: 'number', description: 'Max Qdrant vectors to fetch (default: 500)' },
					dupThreshold: { type: 'number', description: 'Similarity threshold for near-duplicate detection (default: 0.92)' },
					halfPrecision: { type: 'boolean', description: 'Use FP16 for 2x VRAM savings (default: false)' },
				},
			},
		},
	},
	{
		type: 'function' as const,
		function: {
			name: 'analyze_graph',
			description:
				'Run Neo4j graph analysis only: PageRank to find central files/dependency bottlenecks, and community detection to discover subsystem boundaries. Faster than full audit — skips vector/GPU phases.',
			parameters: {
				type: 'object',
				properties: {
					caseId: { type: 'string', description: 'Optional case UUID to scope the graph' },
					maxNodes: { type: 'number', description: 'Max graph nodes (default: 500)' },
					includeCommunities: { type: 'boolean', description: 'Run community detection (default: true)' },
				},
			},
		},
	},
	{
		type: 'function' as const,
		function: {
			name: 'search_codebase',
			description:
				'Semantic search through codebase vectors in Qdrant. Use to find code related to a specific concept, module, or pattern. Returns ranked code chunks with file paths and similarity scores.',
			parameters: {
				type: 'object',
				required: ['query'],
				properties: {
					query: { type: 'string', description: 'What to search for in the codebase' },
					limit: { type: 'number', description: 'Max results (default: 10)' },
				},
			},
		},
	},
	{
		type: 'function' as const,
		function: {
			name: 'get_audit_report',
			description:
				'Retrieve the latest GPU audit report from Postgres. Use when the user asks about previous audit results, central files, duplicate code, or codebase structure without running a new audit.',
			parameters: {
				type: 'object',
				properties: {
					caseId: { type: 'string', description: 'Optional case UUID filter' },
				},
			},
		},
	},
	{
		type: 'function' as const,
		function: {
			name: 'gpu_status',
			description:
				'Check GPU/CUDA availability and VRAM usage. Use before recommending full audit or half-precision mode.',
			parameters: {
				type: 'object',
				properties: {},
			},
		},
	},
] as const;

// ── Zod Validation Schemas ────────────────────────────────────────────

const TOOL_ARG_SCHEMAS: Record<string, z.ZodType> = {
	run_gpu_audit: z.object({
		caseId: z.string().uuid().optional(),
		maxNodes: z.number().int().min(10).max(5000).optional(),
		clusterCount: z.number().int().min(2).max(50).optional(),
		maxVectors: z.number().int().min(10).max(2000).optional(),
		dupThreshold: z.number().min(0.80).max(0.99).optional(),
		halfPrecision: z.boolean().optional(),
	}),
	analyze_graph: z.object({
		caseId: z.string().uuid().optional(),
		maxNodes: z.number().int().min(10).max(5000).optional(),
		includeCommunities: z.boolean().optional(),
	}),
	search_codebase: z.object({
		query: z.string().min(1),
		limit: z.number().int().min(1).max(50).optional(),
	}),
	get_audit_report: z.object({
		caseId: z.string().uuid().optional(),
	}),
	gpu_status: z.object({}),
};

const TOOL_TIMEOUT_MS: Record<string, number> = {
	run_gpu_audit: 60_000,
	analyze_graph: 30_000,
	search_codebase: 10_000,
	get_audit_report: 5_000,
	gpu_status: 3_000,
};

function validateToolArgs(name: string, args: Record<string, unknown>): Record<string, unknown> | null {
	const schema = TOOL_ARG_SCHEMAS[name];
	if (!schema) return args;
	const result = schema.safeParse(args);
	return result.success ? (result.data as Record<string, unknown>) : null;
}

// ── Tool Result Type ──────────────────────────────────────────────────

export interface AuditToolResult {
	ok: boolean;
	tool: string;
	result: string;
	durationMs: number;
	data?: Record<string, unknown>;
}

// ── Tool Executor ─────────────────────────────────────────────────────

export async function executeAuditTool(
	name: string,
	args: Record<string, unknown>
): Promise<AuditToolResult> {
	const start = Date.now();
	const timeout = TOOL_TIMEOUT_MS[name] ?? 15_000;

	try {
		switch (name) {
			case 'run_gpu_audit': {
				const { runGpuAudit, persistAuditReport } = await import(
					'$lib/server/audit/gpu-audit-orchestrator.js'
				);
				const report = await Promise.race([
					runGpuAudit({
						userId: 'gemma-tool-router',
						caseId: args.caseId as string | undefined,
						maxNodes: (args.maxNodes as number) ?? 500,
						clusterCount: args.clusterCount as number | undefined,
						maxVectors: (args.maxVectors as number) ?? 500,
						dupThreshold: (args.dupThreshold as number) ?? 0.92,
						halfPrecision: (args.halfPrecision as boolean) ?? false,
					}),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), timeout)
					),
				]);

				let reportId: string | undefined;
				try {
					reportId = await persistAuditReport(report);
				} catch { /* non-fatal */ }

				const summary = [
					`## GPU Codebase Audit Complete`,
					`- **Graph**: ${report.stats.graphNodeCount} nodes, ${report.stats.graphEdgeCount} edges`,
					`- **Vectors**: ${report.stats.vectorCount} (${report.stats.vectorDimension}d)`,
					`- **Central files**: ${report.centralFiles.length} (top: ${report.centralFiles[0]?.title || 'none'})`,
					`- **Communities**: ${report.communities.length}`,
					`- **Near-duplicates**: ${report.stats.duplicatePairCount} pairs (≥${args.dupThreshold ?? 0.92})`,
					`- **Code clusters**: ${report.stats.clusterCount}`,
					`- **GPU**: CUDA=${report.gpu.cuda}, ${report.gpu.freeMB}MB free / ${report.gpu.totalMB}MB total`,
					`- **Timing**: graph=${report.timing.graphMs}ms, vectors=${report.timing.vectorFetchMs}ms, similarity=${report.timing.similarityMs}ms, clustering=${report.timing.clusteringMs}ms, total=${report.timing.totalMs}ms`,
					reportId ? `- **Report ID**: ${reportId}` : '',
				].filter(Boolean).join('\n');

				return { ok: true, tool: name, result: summary, durationMs: Date.now() - start, data: { reportId, stats: report.stats, timing: report.timing } };
			}

			case 'analyze_graph': {
				const { analyzeGraph } = await import('$lib/server/graph/gpu-graph-analysis.js');
				const graphResult = await Promise.race([
					analyzeGraph({
						caseId: args.caseId as string | undefined,
						includePageRank: true,
						includeCommunities: (args.includeCommunities as boolean) ?? true,
						maxNodes: (args.maxNodes as number) ?? 500,
					}),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), timeout)
					),
				]);

				const topFiles = (graphResult.pageRank ?? []).slice(0, 10)
					.map((pr, i) => `${i + 1}. **${pr.title || pr.nodeId}** (${pr.label}) — PageRank: ${pr.score}`)
					.join('\n');

				const communities = (graphResult.communities ?? []).slice(0, 8)
					.map((c, i) => `${i + 1}. Community ${c.communityId}: ${c.size} members — ${c.members.slice(0, 3).map(m => m.title || m.label).join(', ')}`)
					.join('\n');

				const summary = [
					`## Graph Analysis: ${graphResult.nodeCount} nodes, ${graphResult.edgeCount} edges`,
					`### Top Central Files (PageRank)`,
					topFiles || 'No nodes found',
					graphResult.communities ? `### Communities` : '',
					communities,
					`Duration: ${graphResult.durationMs}ms${graphResult.cached ? ' (cached)' : ''}`,
				].filter(Boolean).join('\n');

				return { ok: true, tool: name, result: summary, durationMs: Date.now() - start };
			}

			case 'search_codebase': {
				const query = String(args.query || '');
				const limit = Number(args.limit ?? 10);

				// embed the query
				const embedRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model: VLM_MODELS.embedding, input: query }),
					signal: AbortSignal.timeout(10_000),
				});

				if (!embedRes.ok) {
					return { ok: false, tool: name, result: 'Failed to embed query', durationMs: Date.now() - start };
				}

				const embedData = await embedRes.json();
				const queryVec: number[] = embedData.embeddings?.[0] ?? [];
				if (queryVec.length === 0) {
					return { ok: false, tool: name, result: 'Empty embedding returned', durationMs: Date.now() - start };
				}

				// search Qdrant
				const searchRes = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/search`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						vector: queryVec,
						limit,
						with_payload: true,
						score_threshold: 0.3,
					}),
					signal: AbortSignal.timeout(10_000),
				});

				if (!searchRes.ok) {
					return { ok: false, tool: name, result: 'Qdrant search failed', durationMs: Date.now() - start };
				}

				const searchData = await searchRes.json();
				const hits = searchData.result ?? [];
				if (hits.length === 0) {
					return { ok: true, tool: name, result: 'No matching codebase chunks found.', durationMs: Date.now() - start };
				}

				const formatted = hits.map((h: any, i: number) => {
					const path = h.payload?.relativePath ?? h.payload?.path ?? 'unknown';
					const symbol = h.payload?.symbol ?? '';
					const score = ((h.score ?? 0) * 100).toFixed(0);
					return `${i + 1}. [${score}%] **${path}**${symbol ? ` — ${symbol}` : ''}`;
				}).join('\n');

				return { ok: true, tool: name, result: `## Codebase Search: "${query}"\n${formatted}`, durationMs: Date.now() - start };
			}

			case 'get_audit_report': {
				const { getLatestAuditReport } = await import('$lib/server/audit/gpu-audit-orchestrator.js');
				const report = await Promise.race([
					getLatestAuditReport(args.caseId as string | undefined),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), timeout)
					),
				]);

				if (!report) {
					return { ok: true, tool: name, result: 'No GPU audit reports found. Run `run_gpu_audit` first.', durationMs: Date.now() - start };
				}

				const summary = [
					`## Latest GPU Audit Report`,
					`- Graph: ${report.stats.graphNodeCount} nodes, ${report.stats.graphEdgeCount} edges`,
					`- Vectors: ${report.stats.vectorCount}`,
					`- Central files: ${report.centralFiles.length}`,
					`- Communities: ${report.communities.length}`,
					`- Near-duplicates: ${report.stats.duplicatePairCount}`,
					`- Clusters: ${report.stats.clusterCount}`,
					`- Total time: ${report.timing.totalMs}ms`,
					'',
					`### Top 5 Central Files`,
					...report.centralFiles.slice(0, 5).map((cf, i) =>
						`${i + 1}. **${cf.title || cf.nodeId}** (${cf.label}) — PR: ${cf.pageRankScore}`),
				].join('\n');

				return { ok: true, tool: name, result: summary, durationMs: Date.now() - start };
			}

			case 'gpu_status': {
				const { isCudaAvailable, getCudaMemoryInfo } = await import(
					'$lib/server/gpu/libtorch-bridge.js'
				);
				const cuda = isCudaAvailable();
				const mem = getCudaMemoryInfo();
				const result = [
					`## GPU Status`,
					`- CUDA available: ${cuda}`,
					`- VRAM: ${mem.freeMB}MB free / ${mem.totalMB}MB total (${mem.usedMB}MB used)`,
					cuda ? '- Recommendation: Full FP32 audit supported' : '- Recommendation: CPU fallback mode, consider halfPrecision=true',
				].join('\n');
				return { ok: true, tool: name, result, durationMs: Date.now() - start };
			}

			default:
				return { ok: false, tool: name, result: `Unknown audit tool: ${name}`, durationMs: Date.now() - start };
		}
	} catch (err) {
		return {
			ok: false,
			tool: name,
			result: `Tool ${name} failed: ${(err as Error)?.message ?? 'unknown error'}`,
			durationMs: Date.now() - start,
		};
	}
}

// ── Gemma 4 Agentic Loop ─────────────────────────────────────────────

const AUDIT_SYSTEM_PROMPT = `You are a codebase analysis assistant with GPU-accelerated audit tools.
Your job is to understand codebases by analyzing their structure (graph), semantics (embeddings), and patterns (duplicates, clusters).

Available tools:
- run_gpu_audit: Full pipeline — Neo4j PageRank + community detection + Qdrant vectors + GPU similarity matrix + K-means clustering. Use for comprehensive codebase understanding.
- analyze_graph: Graph-only analysis — faster, shows central files and subsystem communities. Use when user asks about dependencies, bottlenecks, or structure.
- search_codebase: Semantic search — finds code chunks by meaning. Use when user asks about specific modules, patterns, or functionality.
- get_audit_report: Retrieves last saved audit. Use when user asks about previous results.
- gpu_status: Check CUDA/VRAM. Use before recommending audit parameters.

Always check GPU status before running large audits. If VRAM is low, suggest halfPrecision=true.
After running tools, synthesize the results into a clear, actionable summary. Highlight:
1. Central/critical files (high PageRank)
2. Subsystem boundaries (communities)
3. Near-duplicate code that should be refactored
4. Unexpected code clusters
5. Orphan components with no graph connections`;

export interface AuditPlannerRequest {
	query: string;
	caseId?: string;
	conversationHistory?: Array<{ role: string; content: string }>;
}

export interface AuditPlannerResult {
	response: string;
	toolResults: AuditToolResult[];
	totalDurationMs: number;
}

/**
 * Run the Gemma 4 agentic audit planner.
 *
 * Sends the user's query to Gemma 4 with audit tools. The model decides which
 * tools to call, executes them, and synthesizes a readable report.
 */
export async function runAuditPlanner(req: AuditPlannerRequest): Promise<AuditPlannerResult> {
	const totalStart = Date.now();
	const MAX_TOOL_ROUNDS = 3;
	const MAX_TOTAL_TOOL_CALLS = 5;
	let toolRounds = 0;
	let totalToolCalls = 0;
	const allResults: AuditToolResult[] = [];

	const messages: Array<{ role: string; content: string }> = [
		{ role: 'system', content: AUDIT_SYSTEM_PROMPT },
		...(req.conversationHistory ?? []).slice(-6),
		{ role: 'user', content: req.query },
	];

	const ollamaUrl = ENV.OLLAMA_BASE_URL;
	const keepAlive = '2m';

	// Multi-round tool-calling loop
	while (toolRounds < MAX_TOOL_ROUNDS) {
		let res: Response;
		try {
			res = await ollamaFetch(`${ollamaUrl}/api/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: VLM_MODELS.gemma4,
					messages,
					stream: false,
					tools: AUDIT_TOOLS,
					keep_alive: keepAlive,
					options: {
						temperature: 0.1,
						top_k: 20,
						top_p: 0.8,
						num_ctx: 8192,
						num_predict: 512,
					},
				}),
				signal: AbortSignal.timeout(30_000),
			});
		} catch {
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
		const assistantContent = data.message?.content || '';

		// No tool calls — model is done, return its response
		if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
			return {
				response: assistantContent,
				toolResults: allResults,
				totalDurationMs: Date.now() - totalStart,
			};
		}

		// Append assistant message (may contain thinking)
		messages.push({ role: 'assistant', content: assistantContent });

		// Execute each tool call
		for (const tc of toolCalls) {
			if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) break;
			const toolName = tc.function?.name;
			const rawArgs = tc.function?.arguments || {};
			if (!toolName) continue;

			const toolArgs = validateToolArgs(toolName, rawArgs);
			if (!toolArgs) {
				allResults.push({
					ok: false,
					tool: toolName,
					result: `Invalid arguments for ${toolName}`,
					durationMs: 0,
				});
				totalToolCalls++;
				messages.push({ role: 'tool', content: `Invalid arguments for ${toolName}` });
				continue;
			}

			const tr = await executeAuditTool(toolName, toolArgs);
			allResults.push(tr);
			totalToolCalls++;
			messages.push({ role: 'tool', content: tr.result });
		}

		toolRounds++;
	}

	// If we exhausted rounds without a final response, make one last call without tools
	try {
		const finalRes = await ollamaFetch(`${ollamaUrl}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: VLM_MODELS.gemma4,
				messages,
				stream: false,
				keep_alive: keepAlive,
				options: { temperature: 0.3, num_ctx: 8192, num_predict: 1024 },
			}),
			signal: AbortSignal.timeout(30_000),
		});

		if (finalRes.ok) {
			const finalData = await finalRes.json();
			return {
				response: finalData.message?.content || 'Audit tools executed but no summary generated.',
				toolResults: allResults,
				totalDurationMs: Date.now() - totalStart,
			};
		}
	} catch { /* fall through */ }

	return {
		response: allResults.length > 0
			? `Executed ${allResults.length} tool(s) but could not generate summary. Raw results attached.`
			: 'No audit tools were executed.',
		toolResults: allResults,
		totalDurationMs: Date.now() - totalStart,
	};
}
