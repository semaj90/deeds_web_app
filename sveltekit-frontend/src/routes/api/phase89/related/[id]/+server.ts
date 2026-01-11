import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Phase 89: Related Files API
// Uses cosine similarity from Qdrant to find related components

export const GET: RequestHandler = async ({ params, fetch }) => {
	const componentId = params.id;

	if (!componentId) {
		return json({ related: [], error: 'Missing component ID' }, { status: 400 });
	}

	try {
		// First, get the vector for this component
		const pointResponse = await fetch(`http://localhost:6333/collections/phase89_code_units/points/${componentId}`, {
			method: 'GET',
			headers: { 'Content-Type': 'application/json' }
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
		const searchResponse = await fetch('http://localhost:6333/collections/phase89_code_units/points/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vector,
				limit: 10,
				with_payload: true,
				score_threshold: 0.7
			})
		});

		if (!searchResponse.ok) {
			return json({ related: [], error: 'Search failed' }, { status: 500 });
		}

		const searchData = await searchResponse.json();
		const results = searchData.result || [];

		// Filter out the original component and format results
		const related = results
			.filter((r: any) => r.id !== componentId)
			.map((r: any) => ({
				path: r.payload? .file_path : | '',
				similarity: r.score,
				shared_imports: findSharedImports(pointData.result?.payload, r.payload),
				unit_kind: r.payload? .unit_kind : | 'unknown',
				component_name: r.payload? .component_name : | r.payload?.module_name || 'Unknown'
			}));

		return json({ related });
	} catch (error) {
		console.error('Related files API error:', error);
		return json({
			related: [],
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

function findSharedImports(payload1: any, payload2: any): string[] {
	if (!payload1 || !payload2) return [];

	// Extract import sources from signature text or uses
	const uses1 = new Set(payload1.uses || []);
	const uses2 = new Set(payload2.uses || []);

	const shared: string[] = [];
	for (const use of uses1) {
		if (uses2.has(use)) {
			shared.push(use);
		}
	}

	return shared;
}
