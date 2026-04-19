import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/phase89/reindex
 * Triggers a re-index of the codebase into Qdrant codebase_chunks_768.
 * Checks current state first and returns immediately with status.
 */
export const POST: RequestHandler = async ({ locals, fetch }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		// Check current state
		const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
		const client = qdrant.client;

		let currentPoints = 0;
		try {
			if (client) {
				const info = await client.getCollection('codebase_chunks_768');
				currentPoints = (info as any)?.points_count ?? 0;
			}
		} catch { /* collection may not exist */ }

		// Trigger re-index via internal fetch
		const indexRes = await fetch('/api/codebase-index', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ force: true }),
		});

		const indexData = await indexRes.json().catch(() => ({}));

		return json({
			success: indexRes.ok,
			previousPoints: currentPoints,
			message: indexRes.ok
				? `Re-index triggered. Previous count: ${currentPoints} points.`
				: `Re-index failed: ${indexData.error ?? 'Unknown error'}`,
			indexResponse: indexData,
			timestamp: new Date().toISOString(),
		});
	} catch (e) {
		return json({
			success: false,
			previousPoints: 0,
			message: `Re-index failed: ${(e as Error).message}`,
			indexResponse: null,
			timestamp: new Date().toISOString(),
		});
	}
};
