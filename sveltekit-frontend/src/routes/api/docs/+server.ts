/**
 * GET /api/docs — API registry endpoint
 * Returns categorized catalog of all API endpoints.
 * Query: ?category=Auth&q=search&status=active
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import {
	API_REGISTRY,
	getEndpointsByCategory,
	getCategories,
	searchEndpoints,
	getRegistrySummary
} from '$lib/server/api-registry.js';

export const GET: RequestHandler = async ({ url }) => {
	const category = url.searchParams.get('category');
	const query = url.searchParams.get('q');
	const status = url.searchParams.get('status');

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
