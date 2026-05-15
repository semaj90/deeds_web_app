import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ url }) => {
	throw redirect(308, `/demos/yorha${url.search}`);
};
