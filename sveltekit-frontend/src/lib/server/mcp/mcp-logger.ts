/**
 * mcp-logger.ts — Structured per-tool logging for the MCP server.
 *
 * Usage:
 *   const result = await withMcpLog('tool.name', args, () => doWork(args));
 *
 * Features:
 *   - Emits structured JSON to stdout on every tool call (tool, ok, degraded, durationMs, ts)
 *   - Redacts sensitive argument keys (password, token, secret, key, auth)
 *   - Integrates with Langfuse when LANGFUSE_ENABLED=true (non-fatal if disabled)
 *   - Never throws on its own — always re-throws the original error after logging
 */
import { traceLLM } from '$lib/server/observability/langfuse.js';

// Keys containing these substrings (case-insensitive) are replaced with '[REDACTED]'
const REDACT_SUBSTRINGS = ['password', 'token', 'secret', 'key', 'auth', 'apikey', 'api_key', 'bearer'];

function sanitizeArgs(args: unknown): Record<string, unknown> {
	if (!args || typeof args !== 'object' || Array.isArray(args)) return {};
	return Object.fromEntries(
		Object.entries(args as Record<string, unknown>).map(([k, v]) => {
			const lk = k.toLowerCase();
			const redact = REDACT_SUBSTRINGS.some(r => lk.includes(r));
			return [k, redact ? '[REDACTED]' : v];
		}),
	);
}

/**
 * Wrap a MCP tool call with structured logging + optional Langfuse trace.
 * T should expose optional `ok` and `degraded` fields for accurate log output.
 * Re-throws any error thrown by fn after writing the error log entry.
 */
export async function withMcpLog<T extends { ok?: boolean; degraded?: boolean }>(
	toolName: string,
	args: unknown,
	fn: () => Promise<T>,
): Promise<T> {
	const start = Date.now();
	const safeArgs = sanitizeArgs(args);

	try {
		const result = await traceLLM(
			`mcp.${toolName}`,
			{ tool: toolName, args: safeArgs },
			async (gen) => {
				const r = await fn();
				const ms = Date.now() - start;
				gen.end({
					output: JSON.stringify({ ok: r.ok, degraded: r.degraded }),
					statusMessage: r.degraded ? 'degraded' : 'ok',
					level: r.degraded ? 'WARNING' : 'DEFAULT',
				});
				console.log(
					JSON.stringify({
						mcp: true,
						tool: toolName,
						ok: r.ok ?? true,
						degraded: r.degraded ?? false,
						durationMs: ms,
						ts: new Date().toISOString(),
					}),
				);
				return r;
			},
		);
		return result;
	} catch (err: unknown) {
		const ms = Date.now() - start;
		console.error(
			JSON.stringify({
				mcp: true,
				tool: toolName,
				ok: false,
				degraded: false,
				error: err instanceof Error ? err.message : String(err),
				durationMs: ms,
				ts: new Date().toISOString(),
			}),
		);
		throw err;
	}
}
