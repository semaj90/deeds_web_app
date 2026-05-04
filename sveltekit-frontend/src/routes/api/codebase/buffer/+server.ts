import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIngestionBuffer, getAllIngestionBuffers } from '$lib/server/graph/ingestion-buffer-builder.js';

/**
 * GET /api/codebase/buffer
 * Query params:
 *   ?scope=cluster&id=3         → single cluster buffer
 *   ?scope=cluster              → all cluster buffers
 *   ?k=20                       → cluster count (default 20)
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ buffers: [], total: 0, error: 'Unauthorized' }, { status: 401 });
	try {
		const scope = url.searchParams.get('scope') ?? 'cluster';
		const idParam = url.searchParams.get('id');
		const k = parseInt(url.searchParams.get('k') ?? '20', 10) || 20;

		if (idParam !== null) {
			const clusterId = parseInt(idParam, 10);
			if (isNaN(clusterId)) {
				return json({ buffer: null, error: 'Invalid cluster ID' }, { status: 400 });
			}
			const buffer = await getIngestionBuffer(scope, clusterId, k);
			return json({ buffer });
		}

		const buffers = await getAllIngestionBuffers(k);
		return json({ buffers, total: buffers.length });
	} catch {
		return json({ buffers: [], total: 0 });
	}
};
