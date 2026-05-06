import { json } from '@sveltejs/kit';
import { getTopClusters } from '$lib/server/ai/code-intel-service.js';

export async function GET({ url, locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const limit = Number(url.searchParams.get('limit') ?? '10');

	try {
		const clusters = await getTopClusters(limit);
		return json(clusters);
	} catch {
		return json([]);
	}
}
