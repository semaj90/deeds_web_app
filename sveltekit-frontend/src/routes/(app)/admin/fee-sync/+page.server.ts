import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, fetch }) => {
	if (locals.user?.role !== 'admin' && locals.user?.role !== 'superadmin') throw redirect(303, '/dashboard');
	const response = await fetch('/api/admin/fee-sync');
	const status = response.ok ? await response.json() : { salesforceConfigured: false, writesEnabled: false, mode: 'offline' };
	return { status };
};
