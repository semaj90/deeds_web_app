import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadFeatureLabelAdminView } from '$lib/server/atlas/feature-labels/feature-label-admin.js';

// Same admin gate as admin/ai-dashboard. Read-only: this route performs no writes.
export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user?.role !== 'admin') throw redirect(303, '/dashboard');
	const limit = Number(url.searchParams.get('limit') ?? '100');
	return { view: await loadFeatureLabelAdminView(Number.isFinite(limit) ? limit : undefined) };
};
