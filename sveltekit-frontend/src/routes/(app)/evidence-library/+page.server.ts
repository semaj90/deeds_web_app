import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Phase 96: Route Consolidation
 * /evidence-library is deprecated in favor of /evidence
 * 301 redirect for SEO (permanent redirect)
 */
export const load: PageServerLoad = async () => {
	throw redirect(301, '/evidence');
};
