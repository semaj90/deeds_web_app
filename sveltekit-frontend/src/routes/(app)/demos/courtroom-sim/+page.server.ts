import { redirect } from '@sveltejs/kit';
import type { ServerLoad } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { fictionalCases } from '$lib/server/db/schema-postgres.js';
import { desc } from 'drizzle-orm';

export const load: ServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const cases = await db
		.select({
			id: fictionalCases.id,
			caseId: fictionalCases.caseId,
			category: fictionalCases.category,
			charge: fictionalCases.charge,
			primaryStatute: fictionalCases.primaryStatute,
			defendantName: fictionalCases.defendantName,
			jurisdiction: fictionalCases.jurisdiction,
			jurisdictionCity: fictionalCases.jurisdictionCity,
			incidentDate: fictionalCases.incidentDate,
			narrative: fictionalCases.narrative,
		})
		.from(fictionalCases)
		.orderBy(desc(fictionalCases.category))
		.limit(200)
		.catch(() => []);

	return {
		user: locals.user,
		fictionalCases: cases,
	};
};
