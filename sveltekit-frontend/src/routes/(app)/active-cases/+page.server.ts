import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema';
import { eq, desc, sql, and, ne } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const safe = <T>(p: Promise<T>, fallback: T, timeoutMs = 5000): Promise<T> =>
	Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs))]).catch(() => fallback);

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user ?? null;

	// Fetch only active/open cases with counts
	const activeCases = await safe(
		db.select({
			id: cases.id,
			title: cases.title,
			status: cases.status,
			priority: cases.priority,
			description: cases.description,
			createdAt: cases.createdAt,
			updatedAt: cases.updatedAt,
		})
			.from(cases)
			.where(and(
				ne(cases.status, 'closed'),
				ne(cases.status, 'archived')
			))
			.orderBy(desc(cases.updatedAt))
			.limit(200),
		[]
	);

	// Stats: total active, by priority, by status
	const totalAll = await safe(
		db.select({ count: sql<number>`count(*)::int` }).from(cases),
		[{ count: 0 }]
	);

	const totalClosed = await safe(
		db.select({ count: sql<number>`count(*)::int` })
			.from(cases)
			.where(eq(cases.status, 'closed')),
		[{ count: 0 }]
	);

	return {
		activeCases,
		stats: {
			active: activeCases.length,
			total: totalAll[0]?.count ?? 0,
			closed: totalClosed[0]?.count ?? 0,
			high: activeCases.filter(c => c.priority === 'high' || c.priority === 'critical').length,
			medium: activeCases.filter(c => c.priority === 'medium').length,
			low: activeCases.filter(c => c.priority === 'low').length,
		},
		user,
		loadError: null,
	};
};