/**
 * mcp-tool-bridge.ts
 *
 * Adapter that converts TRACE MCP tools into Vercel AI SDK tool() definitions.
 *
 * This bridges:
 *   llama-server :8090 (tool_calls)
 *     ↓
 *   Vercel AI SDK generateText/streamText()
 *     ↓
 *   MCP JSON-RPC 2.0 tools/call
 *     ↓
 *   TRACE MCP server :8788
 *
 * All dispatch goes through JSON-RPC 2.0 (/mcp, method: tools/call).
 */

import { tool } from 'ai';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';

const TRACE_MCP_URL = ENV.TRACE_MCP_URL ?? 'http://127.0.0.1:8788';

/**
 * Call a TRACE MCP tool via JSON-RPC 2.0.
 *
 * Note: StreamableHTTPServerTransport returns Server-Sent Events (SSE),
 * not plain JSON. Response format: event: message\ndata: {json}\n\n
 */
export async function callTraceMcpTool(name: string, args: Record<string, unknown>) {

	const res = await fetch(`${TRACE_MCP_URL}/mcp`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json, text/event-stream',
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name, arguments: args },
		}),
		signal: AbortSignal.timeout(15_000),
	});

	if (!res.ok) {
		return { error: `MCP HTTP ${res.status}` };
	}

	try {
		// StreamableHTTPServerTransport uses Server-Sent Events (SSE)
		// Parse the response to extract JSON from data: lines
		const text = await res.text();
		const lines = text.split('\n');
		let body: Record<string, unknown> | null = null;

		for (const line of lines) {
			if (line.startsWith('data: ')) {
				const dataStr = line.slice(6);
				try {
					body = JSON.parse(dataStr);
					break;
				} catch {
					// skip invalid JSON lines
				}
			}
		}

		if (!body) {
			return { error: 'No valid JSON in MCP response' };
		}

		// Check for MCP errors
		if ('error' in body && body.error) {
			return { error: `MCP error: ${JSON.stringify(body.error)}` };
		}

		// Extract the result content
		const content = (body.result as any)?.content?.[0]?.text;
		if (content) {
			try {
				return JSON.parse(content);
			} catch {
				return { text: content };
			}
		}

		return { error: 'Empty MCP response content' };
	} catch (e) {
		return { error: String(e) };
	}
}

/**
 * Fetch TRACE tool list once at startup, cache in memory
 */
let _toolListCache: {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}[] | null = null;

async function fetchMcpToolList() {
	if (_toolListCache) return _toolListCache;

	try {
		const res = await fetch(`${TRACE_MCP_URL}/mcp`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 0,
				method: 'tools/list',
				params: {},
			}),
			signal: AbortSignal.timeout(5_000),
		});

		if (!res.ok) {
			console.warn(`[mcp-tool-bridge] tools/list HTTP ${res.status}, using fallback`);
			return [];
		}

		const body = await res.json();
		_toolListCache = body?.result?.tools ?? [];
	} catch (e) {
		console.warn(`[mcp-tool-bridge] tools/list failed: ${e}, using fallback`);
		_toolListCache = [];
	}

	return _toolListCache!;
}

/**
 * Convert a JSON Schema property map into a Zod object schema (runtime, not typed).
 * Handles common types: string, number, boolean, array.
 * Complex schemas (oneOf, anyOf, etc.) fall back to z.unknown().
 */
function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
	if (!schema || schema.type !== 'object') {
		return z.object({}).passthrough();
	}

	const props = (schema.properties as Record<
		string,
		{ type?: string; description?: string }
	>) ?? {};
	const required = (schema.required as string[]) ?? [];
	const shape: Record<string, z.ZodTypeAny> = {};

	for (const [key, def] of Object.entries(props)) {
		let field: z.ZodTypeAny;

		switch (def.type) {
			case 'number':
				field = z.number();
				break;
			case 'boolean':
				field = z.boolean();
				break;
			case 'array':
				field = z.array(z.unknown());
				break;
			default:
				field = z.string();
		}

		// Make optional if not in required list
		shape[key] = required.includes(key) ? field : field.optional();
	}

	return z.object(shape);
}

/**
 * Build a Vercel AI SDK tool map from TRACE MCP tools.
 * Converts Ollama-style `__` namespace separators back to dot notation.
 *
 * @param allowlist Optional list of tool names to include. If not provided, all tools are included.
 * @returns A map of tool name (with __ separators) → Vercel AI SDK tool() definition
 *
 * @ts-ignore Zod v4 / @ai-sdk/openai-compatible v6 type mismatch on execute parameter
 * Runtime behavior is correct; only TypeScript type checking is broken.
 * This will be fixed when the SDK ships Zod 4 support.
 */
export async function buildMcpToolMap(allowlist?: string[]) {
	const toolList = await fetchMcpToolList();
	const result: Record<string, ReturnType<typeof tool>> = {};

	for (const t of toolList) {
		// If allowlist is provided, skip tools not in it
		if (allowlist && !allowlist.includes(t.name)) {
			continue;
		}

		// Convert JSON Schema to Zod
		const schema = jsonSchemaToZod(t.inputSchema as Record<string, unknown>);

		// Escape tool name for use as a JS identifier: dots/colons/dashes → underscores
		const escapedName = t.name.replace(/[.:\-]/g, '__');

		// @ts-ignore — Zod v4 / ai v6 mismatch
		result[escapedName] = tool({
			description: t.description,
			parameters: schema,
			// @ts-expect-error - execute signature mapping type check
			execute: (args: Record<string, unknown>) => callTraceMcpTool(t.name, args),
		});
	}

	return result;
}

/**
 * Pre-built allowlist matching gemma4-tool-controller.ts ALLOWED_MCP_TOOLS.
 * These are the tools safe to expose to llama-server for automatic tool calling.
 */
export const TRACE_TOOL_ALLOWLIST = [
	// Core retrieval + KAG
	'trace.kag_search',
	'kag.search',
	'kag.panel_context',

	// Graph traversal
	'graph.expand_neighborhood',
	'graph.shortest_path',

	// Topology + clustering
	'topology.search_near',
	'clusters.get_summary_lenses',

	// Knowledge base
	'knowledge.search_summary_tree',

	// Dev context + search
	'search.dev_context',
	'trace.explain_retrieval',

	// Context assembly (gating required)
	'context.build_kv_packet',
];
