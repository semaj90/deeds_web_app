import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getQdrantUrl } from '$lib/config/env.server.js';

const QDRANT_URL = getQdrantUrl();

export const GET: RequestHandler = async ({ url, fetch, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const limit = parseInt(url.searchParams.get('limit') || '5000');

	try {
		const response = await fetch(
			`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ limit, with_payload: true, with_vector: false }),
				signal: AbortSignal.timeout(30_000)
			}
		);

		const data = await response.json();
		const points = data.result?.points || [];

		const fileMap = new Map();
		for (const point of points) {
			const { file_path, extension, domain } = point.payload;
			if (!fileMap.has(file_path)) {
				fileMap.set(file_path, { path: file_path, extension, domain, chunks: 0 });
			}
			fileMap.get(file_path).chunks++;
		}

		const graph = {
			nodes: Array.from(fileMap.values()).map(file => ({
				id: file.path,
				label: file.path.split('/').pop(),
				path: file.path,
				type: file.extension,
				size: file.chunks
			})),
			metadata: {
				exported_at: new Date().toISOString(),
				total_files: fileMap.size
			}
		};

		return json(graph);
	} catch (error) {
		return json({ error: 'Export failed' }, { status: 500 });
	}
};
