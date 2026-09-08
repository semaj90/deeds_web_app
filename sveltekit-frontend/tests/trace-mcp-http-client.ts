// Minimal Streamable-HTTP JSON-RPC client for trace-mcp-server (:8788).
//
// `src/lib/server/mcp-client.ts` uses the older GET-based `/sse` transport, which
// trace-mcp-server no longer supports (StreamableHTTPServerTransport with
// sessionIdGenerator: undefined only accepts POST /mcp — GET returns 405). That
// client also has zero callers repo-wide (confirmed 2026-09-08). This helper
// implements the transport trace-mcp-server actually speaks: a single POST per
// call, response as either `application/json` or one SSE `event: message` frame.
//
// Used by integration specs gated behind RUN_LIVE_INTEGRATION=1.

export interface McpToolCallResult {
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
	structuredContent?: Record<string, unknown>;
}

export async function callTraceMcpTool(
	toolName: string,
	args: Record<string, unknown>,
	opts: { baseUrl?: string; timeoutMs?: number } = {},
): Promise<McpToolCallResult> {
	const baseUrl = opts.baseUrl ?? process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788';
	const timeoutMs = opts.timeoutMs ?? 15_000;

	const res = await fetch(`${baseUrl}/mcp`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json, text/event-stream',
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: Date.now(),
			method: 'tools/call',
			params: { name: toolName, arguments: args },
		}),
		signal: AbortSignal.timeout(timeoutMs),
	});

	if (!res.ok) {
		throw new Error(`TRACE_MCP_HTTP_ERROR:${res.status}`);
	}

	const raw = await res.text();
	// SSE framing: "event: message\ndata: {...}\n\n" — extract the JSON payload
	// after the last "data: " line; falls back to parsing the raw body directly
	// if the server answered with plain application/json instead.
	const dataLine = raw.split('\n').find((line) => line.startsWith('data: '));
	const jsonText = dataLine ? dataLine.slice('data: '.length) : raw;

	const parsed = JSON.parse(jsonText) as {
		result?: McpToolCallResult;
		error?: { code: number; message: string };
	};

	if (parsed.error) {
		throw new Error(`TRACE_MCP_RPC_ERROR:${parsed.error.code}:${parsed.error.message}`);
	}
	if (!parsed.result) {
		throw new Error('TRACE_MCP_MALFORMED_RESPONSE');
	}
	return parsed.result;
}

/** True when trace-mcp-server answers (any HTTP status) within a short timeout. */
export async function isTraceMcpReachable(baseUrl?: string): Promise<boolean> {
	try {
		const res = await fetch(`${baseUrl ?? process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788'}/mcp`, {
			method: 'GET',
			signal: AbortSignal.timeout(2_000),
		});
		// Stateless StreamableHTTPServerTransport rejects GET with 405 — that still
		// proves the server is up and listening, which is all this check needs.
		return res.status === 405 || res.ok;
	} catch {
		return false;
	}
}
