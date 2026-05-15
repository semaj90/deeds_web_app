import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const safe = <T>(p: Promise<T>, fb: T): Promise<T> => p.catch(() => fb);

export const load: PageServerLoad = async ({ locals, fetch }) => {
	if (!locals.user) throw redirect(303, '/login');
	const wikiStatus = await safe(fetch('/api/code-intel/wiki-status').then(r => r.json()), {
		noteCount: 0, couchNoteCount: 0, couchDbStatus: 'unknown', syncStatus: 'unknown', latestNote: null,
	});
	return { wikiStatus };
};
