/**
 * GET /api/tools/list
 *
 * List available tools from gRPC ToolCallingService.ListTools.
 * Optionally filter by category:
 *   GET /api/tools/list?category=retrieval
 *
 * Categories: retrieval | search | graph | authority | analysis | cache
 *
 * Response: { tools: ToolDefinition[], total: number, enabled: boolean }
 *
 * Returns empty list (not 503) when gRPC is disabled — callers should check
 * `enabled` to decide whether to surface tool-calling UI.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getToolCallingClient } from '$lib/server/grpc/tool-calling-client.js';

// ── Input schema ──────────────────────────────────────────────────────────────

const querySchema = z.object({
	category: z.enum(['retrieval', 'search', 'graph', 'authority', 'analysis', 'cache']).optional(),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	const category = parsed.success ? parsed.data.category : undefined;

	const client = getToolCallingClient();
	const { tools, total } = await client.listTools(category);

	return json({
		tools,
		total,
		enabled: client.isEnabled,
	});
};
