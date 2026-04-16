import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const res = await fetch('/api/codebase-index/kag-notebook?limit=25');
		if (!res.ok) {
			return { cells: [], stats: null, exportedAt: null, error: `API ${res.status}` };
		}
		const data = await res.json();
		return {
			cells: data.cells ?? [],
			stats: data.stats ?? null,
			exportedAt: data.exportedAt ?? null,
			error: null
		};
	} catch {
		return { cells: [], stats: null, exportedAt: null, error: 'Failed to load KAG notebook' };
	}
};
