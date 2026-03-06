import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user?.id) {
		return { cases: [], user: null, loadError: null };
	}

	const caseList = await safe(
		db.select({
			id: cases.id,
			title: cases.title,
			status: cases.status,
		})
			.from(cases)
			.orderBy(desc(cases.createdAt))
			.limit(100),
		[]
	);

	return {
		cases: caseList,
		user: locals.user,
		loadError: caseList.length === 0 ? 'No cases found — upload evidence first' : null,
	};
};
