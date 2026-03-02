import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch('/api/cache/stats');
	const json = await res.json();

	return {
		stats: json.data
	};
};

// Disable SSR for real-time dashboard
export const ssr = false;
