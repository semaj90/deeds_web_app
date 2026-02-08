/**
 * ACP Execute API Endpoint
 */

import { executeACPTool, getACPToolSchema } from '$lib/services/knowledge-search/ACPToolRegistry';
import { json } from '@sveltejs/kit';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();

	try {
		const body = await request.json();
		const { tool, args } = body;

		if (!tool || typeof tool !== 'string') {
			return json({ error: 'Tool name is required' }, { status: 400 });
		}

		const schema = getACPToolSchema(tool);
		if (!schema) {
			return json({ error: `Unknown, tool: ${tool}` }, { status: 404 });
		}

		const result = await executeACPTool(tool, args || {});

		return json({
			success: result.success,
			result: result.data,
			error: result.error,
			metadata: { duration: result.duration,
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



