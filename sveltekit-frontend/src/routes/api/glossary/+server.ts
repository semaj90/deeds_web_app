/**
 * GET  /api/glossary — List glossary terms (paginated)
 * POST /api/glossary — Create a glossary term
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { legalGlossary } from '$lib/server/db/schema-postgres';
import { ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';

const listSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(500).default(50),
	search: z.string().max(500).optional(),
	category: z.string().max(200).optional(),
});

const createSchema = z.object({
	term: z.string().trim().min(1).max(500),
	definition: z.string().trim().min(1),
	category: z.string().max(200).optional(),
	jurisdiction: z.string().max(200).optional(),
	relatedTerms: z.array(z.string()).optional(),
	sources: z.array(z.string()).optional(),
});

const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = listSchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) return json({ items: [], total: 0 }, { status: 400 });

	const { page, limit, search, category } = parsed.data;
	const offset = (page - 1) * limit;

	const conditions = [];
	if (search) {
		conditions.push(or(ilike(legalGlossary.term, `%${search}%`), ilike(legalGlossary.definition, `%${search}%`)));
	}
	if (category) conditions.push(ilike(legalGlossary.category, category));

	const where = conditions.length > 0 ? conditions.reduce((a, b) => sql`${a} AND ${b}`) : undefined;

	const [items, countResult] = await Promise.all([
		safe(
			db
				.select({
					id: legalGlossary.id,
					term: legalGlossary.term,
					definition: legalGlossary.definition,
					category: legalGlossary.category,
					jurisdiction: legalGlossary.jurisdiction,
					relatedTerms: legalGlossary.relatedTerms,
				})
				.from(legalGlossary)
				.where(where)
				.orderBy(legalGlossary.term)
				.limit(limit)
				.offset(offset),
			[]
		),
		safe(
			db
				.select({ count: sql<number>`count(*)` })
				.from(legalGlossary)
				.where(where)
				.then((r) => Number(r[0]?.count ?? 0)),
			0
		),
	]);

	return json({ items, total: countResult, page, limit });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const parsed = createSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 });
	}

	try {
		const [created] = await db
			.insert(legalGlossary)
			.values({
				term: parsed.data.term,
				definition: parsed.data.definition,
				category: parsed.data.category ?? null,
				jurisdiction: parsed.data.jurisdiction ?? null,
				relatedTerms: parsed.data.relatedTerms ?? null,
				sources: parsed.data.sources ?? null,
			})
			.returning();
		return json({ item: created }, { status: 201 });
	} catch (err) {
		console.error('[POST /api/glossary]', err);
		return json({ error: 'Failed to create term' }, { status: 500 });
	}
};
