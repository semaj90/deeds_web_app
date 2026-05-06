import { json } from '@sveltejs/kit';
import { getMemoryGainStatsByType } from '$lib/server/ai/code-intel-service.js';

export async function GET({ locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const stats = await getMemoryGainStatsByType();
	return json(stats);
}
