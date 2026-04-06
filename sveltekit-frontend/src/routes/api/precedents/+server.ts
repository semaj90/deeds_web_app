/**
 * GET /api/precedents — List legal precedents (paginated)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { legalPrecedents } from '$lib/server/db/schema-postgres';
import { desc, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';

const listSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	search: z.string().max(500).optional(),
});

const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ items: [], total: 0 }, { status: 401 });

	const parsed = listSchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) return json({ items: [], total: 0 }, { status: 400 });

	const { page, limit, search } = parsed.data;
	const offset = (page - 1) * limit;

	const conditions = [];
	if (search) {
		conditions.push(
			or(
				ilike(legalPrecedents.title, `%${search}%`),
				ilike(legalPrecedents.court, `%${search}%`),
				ilike(legalPrecedents.summary, `%${search}%`)
			)
		);
	}

	const where = conditions.length > 0 ? conditions.reduce((a, b) => sql`${a} AND ${b}`) : undefined;

	const [items, countResult] = await Promise.all([
		safe(
			db
				.select({
					id: legalPrecedents.id,
					title: legalPrecedents.title,
					citation: legalPrecedents.citation,
					court: legalPrecedents.court,
					decisionDate: legalPrecedents.decisionDate,
					summary: legalPrecedents.summary,
					createdAt: legalPrecedents.createdAt,
				})
				.from(legalPrecedents)
				.where(where)
				.orderBy(desc(legalPrecedents.createdAt))
				.limit(limit)
				.offset(offset),
			[]
		),
		safe(
			db
				.select({ count: sql<number>`count(*)` })
				.from(legalPrecedents)
				.where(where)
				.then((r) => Number(r[0]?.count ?? 0)),
			0
		),
	]);

	return json({ items, total: countResult, page, limit });
};