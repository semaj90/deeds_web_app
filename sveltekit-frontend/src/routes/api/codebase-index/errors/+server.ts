/**
 * Codebase Index Errors API
 * Endpoint: GET /api/codebase-index/errors
 * Purpose: Query error cards with filtering and pagination
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

import { getQdrantUrl } from '$lib/config/env.server.js';
const QDRANT_URL = getQdrantUrl();
const ERROR_CARDS_COLLECTION = 'phase90_error_cards';

const querySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	pageSize: z.coerce.number().int().min(1).max(200).default(50),
	search: z.string().max(500).optional(),
	errorCode: z.string().max(50).optional(),
	surface: z.string().max(100).optional(),
	tech: z.string().max(100).optional(),
	tool: z.string().max(100).optional()
});

interface QdrantFilter {
	must?: Array<{
		key: string;
		match?: { value: string } | { any: string[] };
	}>;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
		if (!parsed.success) {
			return json({ errors: [], total: 0, page: 1, pageSize: 50, totalPages: 0, error: parsed.error.issues[0]?.message }, { status: 400 });
		}
		const { page, pageSize, search, errorCode, surface, tech, tool } = parsed.data;

		// Build filter
		const filter: QdrantFilter = { must: [] };

		if (errorCode) {
			filter.must!.push({ key: 'errorCode', match: { value: errorCode } });
		}
		if (surface) {
			filter.must!.push({ key: 'surface', match: { any: [surface] } });
		}
		if (tech) {
			filter.must!.push({ key: 'tech', match: { any: [tech] } });
		}
		if (tool) {
			filter.must!.push({ key: 'tool', match: { value: tool } });
		}

		// Query Qdrant
		const response = await fetch(
			`${QDRANT_URL}/collections/${ERROR_CARDS_COLLECTION}/points/scroll`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					filter: filter.must!.length > 0 ? filter : undefined,
					limit: 10000,
					with_payload: true,
					with_vector: false
				})
			}
		);

		if (!response.ok) {
			throw new Error(`Qdrant error: ${response.status}`);
		}

		const data = await response.json();
		let points = data.result?.points ?? [];

		// Apply text search filter (client-side for now)
		if (search) {
			const searchLower = search.toLowerCase();
			points = points.filter((p: { payload: { message?: string; filePath?: string } }) =>
				p.payload?.message?.toLowerCase().includes(searchLower) ||
				p.payload?.filePath?.toLowerCase().includes(searchLower)
			);
		}

		// Paginate
		const total = points.length;
		const start = (page - 1) * pageSize;
		const paginatedPoints = points.slice(start, start + pageSize);

		// Transform to response format
		const errors = paginatedPoints.map((p: { id: string; payload: Record<string, unknown> }) => ({
			id: p.id,
			...p.payload
		}));

		return json({
			errors,
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize)
		});
	} catch (error) {
		console.error('Failed to get errors:', error);
		return json(
			{
				errors: [],
				total: 0,
				page: 1,
				pageSize: 50,
				totalPages: 0,
				error: 'Failed to fetch errors'
			},
			{ status: 500 }
		);
	}
};