import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const safe = <T>(p: Promise<T>, fb: T): Promise<T> => p.catch(() => fb);

export const load: PageServerLoad = async ({ locals, fetch }) => {
	if (!locals.user) throw redirect(303, '/login');

	const [health, latestIndex, wikiStatus] = await Promise.all([
		safe(fetch('/api/code-intel/health').then(r => r.json()), {
			status: 'unknown', checks: {}, memoryGain: { totalDecisions: 0, acceptedCount: 0, averageGainScore: '0.00' },
			clusters: 0, totalTraceRuns: 0, latestIndexAt: null,
		}),
		safe(fetch('/api/code-intel/latest-index').then(r => r.json()), null),
		safe(fetch('/api/code-intel/wiki-status').then(r => r.json()), {
			noteCount: 0, couchNoteCount: 0, couchDbStatus: 'unknown', syncStatus: 'unknown',
		}),
	]);

	return { health, latestIndex, wikiStatus };
};
