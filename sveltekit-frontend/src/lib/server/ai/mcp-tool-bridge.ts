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

const TRACE_MCP_URL = ENV.TRACE_MCP_URL;
let requestSequence = 0;

function nextRequestId(): number {
	requestSequence += 1;
	return requestSequence;
}

function tryParseJson(text: string): unknown | null {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function extractJsonRpcBody(text: string): Record<string, unknown> | null {
	const direct = tryParseJson(text);
	if (direct && typeof direct === 'object') {
		return direct as Record<string, unknown>;
	}

	const events = text.split(/\r?\n\r?\n/);
	for (const event of events) {
		const data = event
			.split(/\r?\n/)
			.filter((line) => line.startsWith('data:'))
			.map((line) => line.replace(/^data:\s?/, ''))
			.join('\n');
		if (!data || data === '[DONE]') continue;
		const parsed = tryParseJson(data);
		if (parsed && typeof parsed === 'object') {
			return parsed as Record<string, unknown>;
		}
	}

	return null;
}

async function readMcpJsonRpcResponse(res: Response): Promise<Record<string, unknown>> {
	const text = await res.text();
	const body = extractJsonRpcBody(text);

	if (!body) {
		throw new Error(
			`MCP returned no valid JSON-RPC payload; content-type=${res.headers.get('content-type') ?? 'unknown'}`
		);
	}

	return body;
}

/**
 * Call a TRACE MCP tool via JSON-RPC 2.0.
 *
 * Note: StreamableHTTPServerTransport returns Server-Sent Events (SSE),
 * not plain JSON. Response format: event: message\ndata: {json}\n\n
 */
export async function callTraceMcpTool(name: string, args: Record<string, unknown>) {
	const requestId = nextRequestId();

	const res = await fetch(`${TRACE_MCP_URL}/mcp`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json, text/event-stream',
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: requestId,
			method: 'tools/call',
			params: { name, arguments: args },
		}),
		signal: AbortSignal.timeout(15_000),
	});

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`MCP HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
	}

	try {
		const body = await readMcpJsonRpcResponse(res);

		// Check for MCP errors
		if ('error' in body && body.error) {
			return { error: `MCP error: ${JSON.stringify(body.error)}`, isError: true };
		}
		if (body.id !== undefined && body.id !== requestId) {
			return { error: `MCP response id mismatch: expected ${requestId}, got ${String(body.id)}`, isError: true };
		}

		// Extract the result content. Prefer structured JSON if present.
		const result = body.result as Record<string, unknown> | undefined;
		const structuredContent = result?.structuredContent;
		if (structuredContent && typeof structuredContent === 'object') {
			return structuredContent as Record<string, unknown>;
		}

		const contentItems = Array.isArray(result?.content) ? result.content : [];
		const textContent = contentItems
			.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
			.filter((item) => typeof item.type === 'string' && item.type === 'text')
			.map((item) => String(item.text ?? '').trim())
			.filter(Boolean)
			.join('\n\n');
		if (textContent) {
			const structured = tryParseJson(textContent);
			if (structured && typeof structured === 'object') {
				return structured as Record<string, unknown>;
			}
			return { text: textContent, isError: Boolean(result?.isError) };
		}

		if (result && typeof result === 'object') {
			const structured = tryParseJson(JSON.stringify(result));
			if (structured && typeof structured === 'object') {
				return { ...(structured as Record<string, unknown>), isError: Boolean(result?.isError) };
			}
		}

		return { error: 'Empty MCP response content' };
	} catch (e) {
		throw e;
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
				id: nextRequestId(),
				method: 'tools/list',
				params: {},
			}),
			signal: AbortSignal.timeout(5_000),
		});

		if (!res.ok) {
			console.warn(`[mcp-tool-bridge] tools/list HTTP ${res.status}, using fallback`);
			return [];
		}

		const body = await readMcpJsonRpcResponse(res);
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
		{ type?: string; description?: string; enum?: unknown[] }
	>) ?? {};
	const required = (schema.required as string[]) ?? [];
	const shape: Record<string, z.ZodTypeAny> = {};

	for (const [key, def] of Object.entries(props)) {
		let field: z.ZodTypeAny;

		if (Array.isArray(def.enum) && def.enum.length > 0 && def.enum.every((value) => typeof value === 'string')) {
			field = z.enum(def.enum as [string, ...string[]]);
		} else {
			switch (def.type) {
				case 'string':
					field = z.string();
					break;
				case 'number':
				case 'integer':
					field = z.number();
					break;
				case 'boolean':
					field = z.boolean();
					break;
				case 'array':
					field = z.array(z.unknown());
					break;
				case 'object':
					field = z.object({}).passthrough();
					break;
				case 'null':
					field = z.null();
					break;
				case undefined:
				default:
					field = z.unknown();
			}
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
