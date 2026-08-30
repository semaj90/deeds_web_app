import { resolve } from 'node:path';

import { applyParentAtlasAgenticReceiptProjectionV1 } from '$lib/server/atlas/tournament/parent-atlas-agentic-receipt-projection-v1.js';
import { applyParentAtlasCacheReceiptProjectionV1 } from '$lib/server/atlas/tournament/parent-atlas-cache-receipt-projection-v1.js';
import { loadParentAtlasTournamentSnapshotV1 } from '$lib/server/atlas/tournament/parent-atlas-tournament-receipt-aggregator-v1.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const repoRoot = process.cwd().endsWith('sveltekit-frontend')
		? resolve(process.cwd(), '..')
		: process.cwd();
	const base = await loadParentAtlasTournamentSnapshotV1(repoRoot);
	const agentic = await applyParentAtlasAgenticReceiptProjectionV1(repoRoot, base);

	return {
		tournament: await applyParentAtlasCacheReceiptProjectionV1(repoRoot, agentic)
	};
};
