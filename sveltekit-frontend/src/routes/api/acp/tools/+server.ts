/**
 * ACP Tools API Endpoint
 * GET /api/acp/tools - List available tools with schemas and capabilities
 */

import { getACPToolRegistry, toolSupportsDryRun } from '$lib/services/knowledge-search/ACPToolRegistry';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types.js';

const querySchema = z.object({
	category: z.string().max(100).optional()
});

export const GET: RequestHandler = async ({ url }) => {
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	const category = parsed.success ? parsed.data.category : undefined;

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
			supportsDryRun: toolSupportsDryRun(t.name),
			inputSchema: t.inputSchema,
			outputSchema: t.outputSchema,
			examples: t.examples
		})),
		count: tools.length
	});
};