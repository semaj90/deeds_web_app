import { json } from '@sveltejs/kit';
import { getLatestIndexStats } from '$lib/server/ai/code-intel-service.js';

export async function GET({ locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const stats = await getLatestIndexStats();
	return json(stats || { message: 'No index runs found' });
}
