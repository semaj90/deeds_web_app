/**
 * ACP Execute API Endpoint
 *
 * POST /api/acp/execute
 * Body: { tool: string, args: object, dryRun?: boolean }
 *
 * When dryRun is true, tools return { kind: "plan", steps: [...] }
 * instead of executing side effects.
 */

import { executeACPTool, getACPToolSchema } from '$lib/services/knowledge-search/ACPToolRegistry';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

const acpExecuteSchema = z.object({
	tool: z.string().min(1, 'Tool name is required').max(500),
	args: z.record(z.string(), z.unknown()).optional().default({}),
	dryRun: z.boolean().optional().default(false)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const startTime = Date.now();

	try {
		const raw = await request.json();
		const parsed = acpExecuteSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { tool, args, dryRun } = parsed.data;

		const schema = getACPToolSchema(tool);
		if (!schema) {
			return json({ error: `Unknown tool: ${tool}` }, { status: 404 });
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
		console.error('ACP Execute error:', error);
		return json(
			{
				error: 'Execution failed'
			},
			{ status: 500 }
		);
	}
};
