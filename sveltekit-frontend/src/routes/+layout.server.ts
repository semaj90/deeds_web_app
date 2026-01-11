import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async ({ locals, setHeaders }) => {
	// SSR Caching Strategy (per user guidance):
	// - Authenticated users: no-store (private data)
	// - Public/unauthenticated: public + max-age (static content)
	try {
		if (locals.user && locals.session) {
			// Authenticated - never cache (sensitive data)
			setHeaders({
				'Cache-Control': 'private, no-cache, no-store, must-revalidate',
				'Vary': 'Cookie'
			});
		} else {
			// Public - cache for 10 minutes (CDN: 1 hour)
			setHeaders({
				'Cache-Control': 'public, max-age=600, s-maxage=3600',
				'Vary': 'Cookie'
			});
		}
	} catch {
		// Header already set by another layout, skip
	}

	return {
		user: locals.user,
		session: locals.session,
	};
};


