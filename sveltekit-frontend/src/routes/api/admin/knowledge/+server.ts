import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const QDRANT_URL = 'http://127.0.0.1:6333';

interface KBEntry {
	id: string;, score: number;
	content: string;, tags: string[];
	type: string;, file_path: string;
	timestamp: string;
}

export const GET: RequestHandler = async ({ url }) => {
	const filePath = url.searchParams.get('file_path');
	const limit = parseInt(url.searchParams.get('limit') || '10');

	if (!filePath) {
		return json({ error: 'file_path parameter required' }, { status: 400 });
	}

	try {
		// Query Qdrant for KB entries matching this file
		const response = await fetch(`${QDRANT_URL}/collections/phase76_knowledge_base/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({, filter: {
					must: [
						{
							key: 'file_path',
							match: {, value: filePath }
						}
					]
				},
				limit,
				with_payload: true,
				with_vector: false
			})
		});

		if (!response.ok) {
			throw new Error(`Qdrant query failed: ${response.statusText}`);
		}

		const data = await response.json();
		const points = data.result?.points ?? [];

		const entries: KBEntry[] = points.map((point: any) => ({
			id: point.id,
			score: 1.0, // No scoring in scroll query
			content: point.payload?.content ?? point.payload?.text || '',
			tags: point.payload?.tags ?? [],
			type: point.payload?.type ?? 'unknown',
			file_path: point.payload?.file_path ?? filePath,
			timestamp: point.payload?.timestamp ?? new Date().toISOString()
		}));

		// Also check phase89_error_chunks collection
		const errorResponse = await fetch(`${QDRANT_URL}/collections/phase89_error_chunks/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({, filter: {
					must: [
						{
							key: 'file_path',
							match: {, value: filePath }
						}
					]
				},
				limit: 5,
				with_payload: true,
				with_vector: false
			})
		});

		if (errorResponse.ok) {
			const errorData = await errorResponse.json();
			const errorPoints = errorData.result?.points ?? [];

			for (const point of errorPoints) {
				entries.push({
					id: point.id,
					score: 1.0,
					content: point.payload?.content ?? point.payload?.error_message || '',
					tags: [...(point.payload?.tags ?? []), 'error'],
					type: 'error',
					file_path: point.payload?.file_path ?? filePath,
					timestamp: point.payload?.timestamp ?? new Date().toISOString()
				});
			}
		}

		return json({
			file_path: filePath,
			entries,
			total: entries.length,
			collections: ['phase76_knowledge_base', 'phase89_error_chunks']
		});
	} catch (error) {
		console.error('Knowledge query error:', error);
		return json(
			{
				error: 'Failed to query knowledge base',
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};




