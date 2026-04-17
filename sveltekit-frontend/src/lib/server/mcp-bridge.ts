/**
 * FastMCP In-Process Bridge
 *
 * Allows server-side code (API routes, ACE assembler, contextual tools)
 * to call MCP tools directly without going through stdio or fetch().
 *
 * This is the "self-call" pattern — the SvelteKit server can invoke its
 * own MCP tools in-process for pipeline composition (e.g., RAG → analyze →
 * rerank → synthesize all as one server-side chain).
 *
 * Usage:
 *   import { mcpBridge } from '$lib/server/mcp-bridge.js';
 *   const result = await mcpBridge.call('rag:search', { query: '...' });
 *   const batch = await mcpBridge.pipeline([
 *     { tool: 'rag:search', args: { query: '...' } },
 *     { tool: 'evidence:analyze', args: { evidenceId: '...', text: '...' } },
 *   ]);
 */

import { mcpTools, type MCPToolResponse } from '../../mcp/index.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MCPBridgeResult<T = unknown> {
	ok: boolean;
	data?: T;
	error?: string;
	tool: string;
	durationMs: number;
}

export interface PipelineStep {
	tool: string;
	args: Record<string, unknown>;
	/** If true, pipeline continues even if this step fails */
	optional?: boolean;
}

// ── Tool Router ───────────────────────────────────────────────────────────────

/** Map tool names to their in-process handlers */
async function routeTool(tool: string, args: Record<string, unknown>): Promise<MCPToolResponse> {
	const [namespace, action] = tool.split(':');

	switch (namespace) {
		case 'cases': {
			const handler = mcpTools.cases[action as keyof typeof mcpTools.cases];
			if (typeof handler === 'function') return (handler as Function)(args);
			break;
		}
		case 'evidence': {
			const handler = mcpTools.evidence[action as keyof typeof mcpTools.evidence];
			if (typeof handler === 'function') return (handler as Function)(args);
			break;
		}
		case 'rag': {
			const handler = mcpTools.rag[action as keyof typeof mcpTools.rag];
			if (typeof handler === 'function') return (handler as Function)(args);
			break;
		}
		case 'reports': {
			const handler = mcpTools.reports[action as keyof typeof mcpTools.reports];
			if (typeof handler === 'function') return (handler as Function)(args);
			break;
		}
		case 'citations': {
			const handler = mcpTools.citations[action as keyof typeof mcpTools.citations];
			if (typeof handler === 'function') return (handler as Function)(args);
			break;
		}
		case 'users': {
			const handler = mcpTools.users[action as keyof typeof mcpTools.users];
			if (typeof handler === 'function') return (handler as Function)(args);
			break;
		}
		default: {
			// Top-level tools (generateEmbedding, semanticSearch, queryRAG, etc.)
			const topLevel = mcpTools[tool as keyof typeof mcpTools];
			if (typeof topLevel === 'function') return (topLevel as Function)(args);
		}
	}

	return { success: false, error: `Unknown tool: ${tool}` };
}

// ── Bridge API ────────────────────────────────────────────────────────────────

export const mcpBridge = {
	/**
	 * Call a single MCP tool in-process.
	 * Returns a normalized result with timing.
	 */
	async call<T = unknown>(tool: string, args: Record<string, unknown> = {}): Promise<MCPBridgeResult<T>> {
		const start = Date.now();
		try {
			const response = await routeTool(tool, args);
			return {
				ok: response.success,
				data: response.data as T,
				error: response.error,
				tool,
				durationMs: Date.now() - start,
			};
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message : String(e),
				tool,
				durationMs: Date.now() - start,
			};
		}
	},

	/**
	 * Run multiple tools in parallel.
	 * All execute concurrently — use pipeline() for sequential with data passing.
	 */
	async parallel<T = unknown>(steps: PipelineStep[]): Promise<MCPBridgeResult<T>[]> {
		return Promise.all(
			steps.map((step) => mcpBridge.call<T>(step.tool, step.args))
		);
	},

	/**
	 * Run tools sequentially. Each step can reference prior results
	 * via the returned array (useful for compose pipelines).
	 * Stops on first non-optional failure.
	 */
	async pipeline<T = unknown>(steps: PipelineStep[]): Promise<MCPBridgeResult<T>[]> {
		const results: MCPBridgeResult<T>[] = [];
		for (const step of steps) {
			const result = await mcpBridge.call<T>(step.tool, step.args);
			results.push(result);
			if (!result.ok && !step.optional) break;
		}
		return results;
	},

	/** List available tool names */
	listTools(): string[] {
		const tools: string[] = [];
		for (const ns of ['cases', 'evidence', 'rag', 'reports', 'citations', 'users'] as const) {
			const group = mcpTools[ns];
			for (const key of Object.keys(group)) {
				if (typeof (group as unknown as Record<string, unknown>)[key] === 'function') {
					tools.push(`${ns}:${key}`);
				}
			}
		}
		// Top-level tools
		for (const key of ['getAnalytics', 'analyzeLegalDocument', 'extractClauses', 'queryRAG', 'generateEmbedding', 'semanticSearch']) {
			if (typeof mcpTools[key as keyof typeof mcpTools] === 'function') {
				tools.push(key);
			}
		}
		return tools;
	},
};
