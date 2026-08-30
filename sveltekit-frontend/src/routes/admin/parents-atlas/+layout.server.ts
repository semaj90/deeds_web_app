import { resolve } from 'node:path';

import { loadParentAtlasTournamentSnapshotV1 } from '$lib/server/atlas/tournament/parent-atlas-tournament-receipt-aggregator-v1.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const repoRoot = process.cwd().endsWith('sveltekit-frontend')
		? resolve(process.cwd(), '..')
		: process.cwd();

	return {
		tournament: await loadParentAtlasTournamentSnapshotV1(repoRoot)
	};
};
