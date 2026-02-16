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

export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();

	try {
		const body = await request.json();
		const { tool, args, dryRun } = body;

		if (!tool || typeof tool !== 'string') {
			return json({ error: 'Tool name is required' }, { status: 400 });
		}

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

	} catch (error: any) {
		console.error('ACP Execute error:', error);
		return json(
			{
				error: 'Execution failed',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
