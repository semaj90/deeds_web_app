/**
 * GET /api/docs — API registry endpoint
 * Returns categorized catalog of all API endpoints.
 * Query: ?category=Auth&q=search&status=active
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import {
	API_REGISTRY,
	getEndpointsByCategory,
	getCategories,
	searchEndpoints,
	getRegistrySummary
} from '$lib/server/api-registry.js';

const querySchema = z.object({
	category: z.string().max(100).optional(),
	q: z.string().max(500).optional(),
	status: z.string().max(50).optional()
});

export const GET: RequestHandler = async ({ url }) => {
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	const { category, q: query, status } = parsed.success ? parsed.data : { category: undefined, q: undefined, status: undefined };

	let endpoints = API_REGISTRY;

	if (category) {
		endpoints = getEndpointsByCategory(category);
	}

	if (query) {
		endpoints = searchEndpoints(query);
	}

	if (status) {
		endpoints = endpoints.filter((e) => e.status === status);
	}

	return json({
		endpoints,
		count: endpoints.length,
		categories: getCategories(),
		summary: getRegistrySummary()
	});
};
