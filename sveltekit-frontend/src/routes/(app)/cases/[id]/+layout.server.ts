import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);
	const caseRows = await safe(db.select().from(cases).where(eq(cases.id, params.id)).limit(1), []);
	const caseRow = caseRows[0];

	return {
		caseData: caseRow
			? {
					id: caseRow.id,
					title: caseRow.title,
					status: caseRow.status,
					jurisdiction: caseRow.jurisdiction ?? null,
				}
			: null,
	};
};