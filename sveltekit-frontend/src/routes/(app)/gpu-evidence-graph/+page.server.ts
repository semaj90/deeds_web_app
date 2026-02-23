import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema';
import { desc, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user ?? null;

	const evidenceItems = await safe(
		db.select({
			id: evidence.id,
			title: evidence.title,
			evidenceType: evidence.evidenceType,
			fileSize: evidence.fileSize,
			createdAt: evidence.createdAt,
		})
			.from(evidence)
			.orderBy(desc(evidence.createdAt))
			.limit(50),
		[]
	);

	const totalCount = await safe(
		db.select({ count: sql<number>`count(*)::int` }).from(evidence),
		[{ count: 0 }]
	);

	return {
		evidenceItems,
		stats: {
			total: totalCount[0]?.count ?? 0,
			loaded: evidenceItems.length,
		},
		user,
	};
};