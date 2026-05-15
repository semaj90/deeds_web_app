import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ url }) => {
	throw redirect(308, `/admin/all-routes${url.search}`);
};
