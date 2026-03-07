import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';

const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const caseId = params.id;

	const caseRows = await safe(
		db.select({
			id: cases.id,
			title: cases.title,
			status: cases.status,
			jurisdiction: cases.jurisdiction,
		}).from(cases).where(eq(cases.id, caseId)).limit(1),
		[]
	);

	return {
		user: locals.user,
		caseData: caseRows[0] ?? null,
		loadError: caseRows[0] ? null : 'Case not found or database unavailable',
	};
};