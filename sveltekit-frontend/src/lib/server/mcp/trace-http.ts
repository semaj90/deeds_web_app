/**
 * Thin HTTP client for the standalone TRACE MCP server (:8788).
 *
 * Extracted from src/lib/server/ai/gemma4-agent.ts so other consumers (intent
 * router, ACE Stage A0, future ops tooling) don't duplicate the request shape.
 *
 * Returns `null` when the server is unreachable so callers can degrade
 * gracefully instead of throwing. Always returns within `timeoutMs` (default 15s).
 */

import { ENV } from '$lib/server/env.server';

export interface TraceMcpCallOptions {
	timeoutMs?: number;
	/** Override TRACE_MCP_URL for this call (test injection). */
	baseUrl?: string;
}

export interface TraceMcpResult {
	/** Parsed `result.content[0].text` (auto-JSON-parsed if valid JSON). */
	data:   unknown;
	/** Wall-clock ms for the round-trip. */
	ms:     number;
	/** true on success, false on transport error / non-200 / parse failure. */
	ok:     boolean;
	/** Human-readable error message when ok=false. */
	error?: string;
}

/**
 * Call one MCP tool over HTTP. Non-fatal on infra errors.
 *
 * @example
 *   const r = await callTraceMcp('kag.multi_lane_search', { query: 'hearsay' });
 *   if (r.ok) console.log(r.data);
 */
export async function callTraceMcp(
	toolName: string,
	toolArgs: Record<string, unknown> = {},
	options: TraceMcpCallOptions = {}
): Promise<TraceMcpResult> {
	const baseUrl   = options.baseUrl ?? ENV.TRACE_MCP_URL;
	const timeoutMs = options.timeoutMs ?? 15_000;
	const startedAt = Date.now();

	try {
		const res = await fetch(`${baseUrl}/mcp`, {
			method:  'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept':       'application/json, text/event-stream',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id:      Date.now(),
				method:  'tools/call',
				params:  { name: toolName, arguments: toolArgs },
			}),
			signal: AbortSignal.timeout(timeoutMs),
		});

		const ms = Date.now() - startedAt;

		if (!res.ok) {
			return { data: null, ms, ok: false, error: `HTTP ${res.status}` };
		}

		// Streamable HTTP transport can return either application/json OR
		// text/event-stream. Handle both.
		const contentType = res.headers.get('content-type') ?? '';
		const raw         = await res.text();

		let body: { result?: { content?: Array<{ text?: string }> }; error?: unknown } | null = null;

		if (contentType.includes('text/event-stream') || raw.startsWith('event:')) {
			// SSE: take the first `data: {...}` line and parse.
			const dataLine = raw.split('\n').find((l) => l.startsWith('data:'));
			if (dataLine) {
				try { body = JSON.parse(dataLine.slice(5).trim()); } catch { /* swallow */ }
			}
		} else {
			try { body = JSON.parse(raw); } catch { /* swallow */ }
		}

		if (!body) {
			return { data: null, ms, ok: false, error: 'unparseable MCP response' };
		}

		if (body.error) {
			return { data: null, ms, ok: false, error: String(body.error) };
		}

		const text = body.result?.content?.[0]?.text;
		if (text === undefined) {
			return { data: body.result ?? null, ms, ok: true };
		}

		// Auto-parse if the tool returned JSON-shaped text.
		try {
			return { data: JSON.parse(text), ms, ok: true };
		} catch {
			return { data: text, ms, ok: true };
		}
	} catch (err) {
		const ms = Date.now() - startedAt;
		return {
			data:  null,
			ms,
			ok:    false,
			error: `TRACE MCP unreachable: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
