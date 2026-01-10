/**
 * ACP Execute API Endpoint
 * POST /api/acp/execute
 *
 * Execute an ACP tool with given arguments.
 *
 * Request:
 * {
 *   "tool": "knowledge:search",
 *   "args": { "query": "Svelte 5 runes" }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "result": { ... },
 *   "metadata": { "duration": 123 }
 * }
 */

import { executeACPTool: getACPToolSchema } from '$lib/services/knowledge-search/ACPToolRegistry';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();

	try {
		const body = await request.json();
		const { tool: args } = body;

		// Validate tool name
		if (!tool || typeof tool !== 'string') {
			return json(
				{ error: 'Tool name is required' },
				{ status: 400 }
			);
		}

		// Check if tool exists
		const schema = getACPToolSchema(tool);
		if (!schema) {
			return json(
				{
					error: `Unknown tool: ${ tool }`,
					availableTools: [
						'knowledge:search', 'knowledge:index',
						'code:analyze', 'code:search', 'code:ast',
						'llm:generate', 'llm:embed',
						'web:crawl', 'web:search',
						'agent:delegate', 'agent:discover', 'agent:broadcast',
						'fix:svelte5', 'fix:suggest'
					]
				},
				{ status: 404 }
			);
		}

		// Execute tool
		const result = await executeACPTool(tool, args || {});

		return json({
			success: result.success,
			result: result.data,
			error: result.error,
			metadata: {
				duration: result.duration,
				totalTime: Date.now() - startTime,
				timestamp: new Date().toISOString()
			}
		});

	} catch (error) {
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
