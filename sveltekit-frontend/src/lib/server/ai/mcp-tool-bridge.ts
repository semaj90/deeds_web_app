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
 * Transport mode is explicit. Legacy behavior remains the default until the
 * TRACE server opts into MCP 2026-07-28. Set TRACE_MCP_PROTOCOL_VERSION to
 * 2026-07-28 only after the server-side protocol proof passes.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import {
	buildMcpHttpHeaders,
	buildMcpRequestParams,
	isMcpCacheFresh,
	parseMcpCacheHint,
	resolveMcpHttpProtocolMode,
	type McpHttpProtocolMode,
} from '$lib/server/mcp/mcp-http-envelope-v1.js';

const TRACE_MCP_URL = ENV.TRACE_MCP_URL;
export const TRACE_MCP_PROTOCOL_MODE: McpHttpProtocolMode = resolveMcpHttpProtocolMode(
	process.env.TRACE_MCP_PROTOCOL_VERSION,
);
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
 * Modern MCP routing headers are emitted only when
 * TRACE_MCP_PROTOCOL_VERSION=2026-07-28. This avoids claiming a protocol
 * revision the checked-in TRACE server has not yet proven.
 */
export async function callTraceMcpTool(name: string, args: Record<string, unknown>) {
	const requestId = nextRequestId();
	const params = buildMcpRequestParams({
		mode: TRACE_MCP_PROTOCOL_MODE,
		params: { name, arguments: args },
		clientName: 'deeds-web-app',
		clientVersion: '1.0.0',
	});

	const res = await fetch(`${TRACE_MCP_URL}/mcp`, {
		method: 'POST',
		headers: buildMcpHttpHeaders({
			mode: TRACE_MCP_PROTOCOL_MODE,
			method: 'tools/call',
			name,
		}),
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: requestId,
			method: 'tools/call',
			params,
		}),
		signal: AbortSignal.timeout(15_000),
	});

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`MCP HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
	}

	const body = await readMcpJsonRpcResponse(res);

	if ('error' in body && body.error) {
		return { error: `MCP error: ${JSON.stringify(body.error)}`, isError: true };
	}
	if (body.id !== undefined && body.id !== requestId) {
		return { error: `MCP response id mismatch: expected ${requestId}, got ${String(body.id)}`, isError: true };
	}

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
}

interface ToolListEntry {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

interface ToolListCacheEntry {
	tools: ToolListEntry[];
	receivedAtMs: number;
	ttlMs: number;
	cacheScope: 'public' | 'private' | null;
}

let _toolListCache: ToolListCacheEntry | null = null;

/**
 * Fetch the TRACE tool list.
 *
 * Legacy mode preserves the existing process-lifetime cache behavior.
 * MCP 2026-07-28 mode obeys the server-provided ttlMs/cacheScope hint; an
 * absent TTL is treated as zero/stale, matching the current specification.
 */
async function fetchMcpToolList(): Promise<ToolListEntry[]> {
	if (_toolListCache) {
		if (TRACE_MCP_PROTOCOL_MODE === 'LEGACY') return _toolListCache.tools;
		if (isMcpCacheFresh({ receivedAtMs: _toolListCache.receivedAtMs, ttlMs: _toolListCache.ttlMs })) {
			return _toolListCache.tools;
		}
	}

	try {
		const params = buildMcpRequestParams({
			mode: TRACE_MCP_PROTOCOL_MODE,
			params: {},
			clientName: 'deeds-web-app',
			clientVersion: '1.0.0',
		});
		const res = await fetch(`${TRACE_MCP_URL}/mcp`, {
			method: 'POST',
			headers: buildMcpHttpHeaders({
				mode: TRACE_MCP_PROTOCOL_MODE,
				method: 'tools/list',
			}),
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: nextRequestId(),
				method: 'tools/list',
				params,
			}),
			signal: AbortSignal.timeout(5_000),
		});

		if (!res.ok) {
			console.warn(`[mcp-tool-bridge] tools/list HTTP ${res.status}, using fallback`);
			return [];
		}

		const body = await readMcpJsonRpcResponse(res) as {
			result?: { tools?: ToolListEntry[]; ttlMs?: number; cacheScope?: 'public' | 'private' };
		} | null;
		const result = body?.result ?? {};
		const tools = result.tools ?? [];
		const hint = TRACE_MCP_PROTOCOL_MODE === 'STATELESS_2026_07_28'
			? parseMcpCacheHint(result)
			: { ttlMs: Number.MAX_SAFE_INTEGER, cacheScope: null };
		_toolListCache = {
			tools,
			receivedAtMs: Date.now(),
			ttlMs: hint.ttlMs,
			cacheScope: hint.cacheScope,
		};
	} catch (e) {
		console.warn(`[mcp-tool-bridge] tools/list failed: ${e}, using fallback`);
		if (!_toolListCache) {
			_toolListCache = { tools: [], receivedAtMs: Date.now(), ttlMs: 0, cacheScope: null };
		}
	}

	return _toolListCache.tools;
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
		if (allowlist && !allowlist.includes(t.name)) {
			continue;
		}

		const schema = jsonSchemaToZod(t.inputSchema as Record<string, unknown>);
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
	'trace.kag_search',
	'kag.search',
	'kag.panel_context',
	'graph.expand_neighborhood',
	'graph.shortest_path',
	'topology.search_near',
	'clusters.get_summary_lenses',
	'knowledge.search_summary_tree',
	'search.dev_context',
	'trace.explain_retrieval',
	'ops.search_tools',
	'context.build_kv_packet',
];
