/**
 * ACP Tools API Endpoint
 * GET /api/acp/tools - List available tools
 * POST /api/acp/execute - Execute a tool
 *
 * Exposes the ACP Tool Registry as REST API for external integration.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getACPToolRegistry, getACPTools } from '$lib/services/knowledge-search/ACPToolRegistry';

/**
 * GET /api/acp/tools
 * List all available ACP tools with their schemas
 */
export const GET: RequestHandler = async ({ url }) => {
	const category = url.searchParams.get('category');

	const registry = getACPToolRegistry();
	let tools = registry.list();

	if (category) {
		tools = registry.byCategory(category);
	}

	return json({
		success: true,
		tools: tools.map(t => ({
			name: t.name,
			description: t.description,
			category: t.category,
			inputSchema: t.inputSchema,
			outputSchema: t.outputSchema
		})),
		count: tools.length
	});
};
