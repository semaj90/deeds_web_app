import { json } from '@sveltejs/kit';
import { getTopologySnapshot } from '$lib/server/ai/code-intel-service.js';

export async function GET({ locals, url }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const snapshotId = url.searchParams.get('snapshotId');
	const snapshot = await getTopologySnapshot(snapshotId || undefined);
	return json(snapshot);
}
