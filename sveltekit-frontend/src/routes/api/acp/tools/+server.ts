/**
 * ACP Tools API Endpoint
 * GET /api/acp/tools - List available tools with schemas and capabilities
 */

import { getACPToolRegistry, toolSupportsDryRun } from '$lib/server/services/knowledge-search/ACPToolRegistry';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types.js';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

const querySchema = z.object({
	category: z.string().max(100).optional()
});

export const GET: RequestHandler = async ({ url, locals, request }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	const category = parsed.success ? parsed.data.category : undefined;

	const registry = getACPToolRegistry();
	let tools = registry.list();

	if (category) {
		tools = registry.byCategory(category);
	}

	const responseData = {
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
	};

	const { etag, isMatch } = checkETag(responseData, request.headers);
	if (isMatch) return notModified(etag);

	return json(responseData, {
		headers: { ...cacheControl.medium, ETag: etag }
	});
};