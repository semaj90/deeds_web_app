import { json } from '@sveltejs/kit';
import { getMemoryGainStats } from '$lib/server/ai/code-intel-service.js';

export async function GET({ locals, url }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const limit = Number(url.searchParams.get('limit')) || 20;
	const stats = await getMemoryGainStats(limit);
	return json(stats);
}
