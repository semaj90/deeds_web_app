import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user || null,
		isAuthenticated: !!locals.user,
		devBypass: process.env.DEV_BYPASS_AUTH === 'true'
	};
};