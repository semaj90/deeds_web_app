import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { reports, cases } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

const safe = <T>(p: Promise<T>, fallback: T): Promise<T> =>
	Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), 5000))]);

export const load: PageServerLoad = async ({ locals, params }) => {
	// Phase 79: Lucia v3 Authentication Guard
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const caseId = params.id;

	// Load case data + reports in parallel
	const [caseRows, reportRows] = await Promise.all([
		safe(db.select().from(cases).where(eq(cases.id, caseId)).limit(1), []),
		safe(
			db
				.select()
				.from(reports)
				.where(eq(reports.caseId, caseId))
				.orderBy(desc(reports.createdAt))
				.limit(20),
			[]
		)
	]);

	return {
		user: locals.user,
		caseData: caseRows[0] || null,
		reports: reportRows || []
	};
};
