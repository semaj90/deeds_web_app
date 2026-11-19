/**
 * ACP Execute API Endpoint
 *
 * POST /api/acp/execute
 * Body: { tool: string, args: object, dryRun?: boolean }
 *
 * When dryRun is true, tools return { kind: "plan", steps: [...] }
 * instead of executing side effects.
 *
 * Authorization (A2A-04 repair, 2026-09-23): authentication alone is NOT
 * authorization. Every dispatch is gated by the same tool-authorization.ts
 * capability owner already used by /api/acp/rpc and /api/agent/execute
 * (toolAuthorizationGuard -> derivePermissionGrant, role -> permission set)
 * plus a per-tool required-permission fact for this route's tool universe
 * (acp-tool-permissions.ts). Order: authentication -> schema/tool existence
 * (preserves the pre-existing 404-before-authorization-info-leak behavior
 * for unknown tool names) -> authorization -> dispatch -> handler. A tool
 * with no entry in the permission map fails closed (code:write, the
 * highest tier), never "no permission required".
 */

import { executeACPTool, getACPToolSchema } from '$lib/server/services/knowledge-search/ACPToolRegistry';
import { requiredAcpToolPermission } from '$lib/server/services/knowledge-search/acp-tool-permissions';
import { toolAuthorizationGuard, hasPermission } from '$lib/server/auth/tool-authorization';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

const acpExecuteSchema = z.object({
	tool: z.string().min(1, 'Tool name is required').max(500),
	args: z.record(z.string(), z.unknown()).optional().default({}),
	dryRun: z.boolean().optional().default(false)
});

/**
 * Error codes (additive `code` field on every error body; `error` text kept for existing clients).
 * Filter server logs with: rg "ACP_" (each log line is JSON with the same `code`).
 */
const ACP_ERROR_CODES = {
	UNAUTHORIZED: 'ACP_UNAUTHORIZED',
	INVALID_JSON: 'ACP_INVALID_JSON',
	INVALID_INPUT: 'ACP_INVALID_INPUT',
	TOOL_NOT_FOUND: 'ACP_TOOL_NOT_FOUND',
	PERMISSION_DENIED: 'ACP_PERMISSION_DENIED',
	EXECUTION_FAILED: 'ACP_EXECUTION_FAILED'
} as const;

export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) {
		return json({ error: 'Unauthorized', code: ACP_ERROR_CODES.UNAUTHORIZED }, { status: 401 });
	}
	const startTime = Date.now();
	let toolName: string | undefined;

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		// Malformed body is a client error, not an execution failure.
		return json(
			{ error: 'Request body must be valid JSON', code: ACP_ERROR_CODES.INVALID_JSON },
			{ status: 400 }
		);
	}

	try {
		const parsed = acpExecuteSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{
					error: parsed.error.issues[0]?.message ?? 'Invalid input',
					code: ACP_ERROR_CODES.INVALID_INPUT
				},
				{ status: 400 }
			);
		}
		const { tool, args, dryRun } = parsed.data;
		toolName = tool;

		const schema = getACPToolSchema(tool);
		if (!schema) {
			return json(
				{ error: `Unknown tool: ${tool}`, code: ACP_ERROR_CODES.TOOL_NOT_FOUND },
				{ status: 404 }
			);
		}

		// AUTHORIZATION -- must happen before dispatch/handler invocation.
		// Registered (schema exists) and advertised (A2A-03 discovery) are
		// both distinct from authorized; neither substitutes for this check.
		const grant = await toolAuthorizationGuard(event);
		const required = requiredAcpToolPermission(tool);
		if (!hasPermission(grant, required)) {
			return json(
				{
						error: `Permission denied: requires '${required}' for tool '${tool}'`,
						code: ACP_ERROR_CODES.PERMISSION_DENIED
					},
				{ status: 403 }
			);
		}

		const result = await executeACPTool(tool, args || {}, {
			dryRun: dryRun === true
		});

		return json({
			success: result.success,
			kind: result.kind ?? 'result',
			result: result.data,
			error: result.error,
			metadata: {
				dryRun: dryRun === true,
				duration: result.duration,
				totalTime: Date.now() - startTime,
				timestamp: new Date().toISOString()
			}
		});

	} catch (error) {
		// Structured, code-tagged log line. Tool arguments are never logged; the
			// error message is truncated to limit any user-data leakage.
			const message = error instanceof Error ? error.message : String(error);
			console.error(
				JSON.stringify({
					level: 'error',
					code: ACP_ERROR_CODES.EXECUTION_FAILED,
					route: '/api/acp/execute',
					tool: toolName ?? null,
					errorName: error instanceof Error ? error.name : 'UnknownError',
					message: message.slice(0, 200),
					durationMs: Date.now() - startTime
				})
			);
		return json(
			{
				error: 'Execution failed',
					code: ACP_ERROR_CODES.EXECUTION_FAILED
			},
			{ status: 500 }
		);
	}
};
