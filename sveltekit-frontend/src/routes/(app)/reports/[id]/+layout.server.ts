import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { reports } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);
	const reportRows = await safe(
		db
			.select()
			.from(reports)
			.where(and(eq(reports.id, params.id), eq(reports.createdBy, Number(locals.user.id))))
			.limit(1),
		[]
	);

	return {
		report: reportRows[0] ?? null,
		loadError: reportRows[0] ? null : 'Report not found or database unavailable',
	};
};