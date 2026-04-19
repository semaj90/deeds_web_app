import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { isUuid } from '$lib/server/validation.js';
import { ENV } from '$lib/server/env.server.js';
// Phase 89: Related Files API
// Uses cosine similarity from Qdrant to find related components

const QDRANT_URL = ENV.QDRANT_URL;

export const GET: RequestHandler = async ({ params, fetch, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const componentId = params.id;

	if (!isUuid(componentId)) {
		return json({ related: [], error: 'Invalid ID format' }, { status: 400 });
	}

	try {
		// First, get the vector for this component
		const pointResponse = await fetch(`${QDRANT_URL}/collections/phase89_code_units/points/${componentId}`, {
			method: 'GET',
			headers: { 'Content-Type': 'application/json' },
			signal: AbortSignal.timeout(5_000)
		});

		if (!pointResponse.ok) {
			return json({ related: [], error: 'Component not found' }, { status: 404 });
		}

		const pointData = await pointResponse.json();
		const vector = pointData.result?.vector;

		if (!vector) {
			return json({ related: [], error: 'No vector for component' }, { status: 404 });
		}

		// Search for similar components
		const searchResponse = await fetch(`${QDRANT_URL}/collections/phase89_code_units/points/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ vector, limit: 10,
				with_payload: true,
				score_threshold: 0.7
			}),
			signal: AbortSignal.timeout(10_000)
		});

		if (!searchResponse.ok) {
			return json({ related: [], error: 'Search failed' }, { status: 500 });
		}

		const searchData = await searchResponse.json();
		const results = searchData?.result|| [];

		// Filter out the original component and format results
		const related = results
			.filter((r: Record<string, any>) => r.id !== componentId)
			.map((r: Record<string, any>) => ({
				path: r.payload?.file_path ?? '',
				similarity: r.score,
				shared_imports: findSharedImports(pointData.result?.payload, r.payload),
				unit_kind: r.payload?.unit_kind ?? 'unknown',
				component_name: r.payload?.component_name ?? r.payload?.module_name ?? 'Unknown'
			}));

		return json({ related });
	} catch (error) {
		console.error('Related files API error:', error);
		return json({ related: [] });
	}
};

function findSharedImports(payload1: Record<string, unknown> | undefined, payload2: Record<string, unknown> | undefined): string[] {
	if (!payload1 || !payload2) return [];

	// Extract import sources from signature text or uses
	const uses1 = new Set<string>((payload1?.uses as string[]) || []);
	const uses2 = new Set<string>((payload2?.uses as string[]) || []);

	const shared: string[] = [];
	for (const use of uses1) {
		if (uses2.has(use)) {
			shared.push(use);
		}
	}

	return shared;
}
