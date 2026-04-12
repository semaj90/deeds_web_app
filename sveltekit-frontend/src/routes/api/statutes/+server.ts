/**
 * GET  /api/statutes — List statutes (paginated)
 * POST /api/statutes — Create a statute
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { statutes } from '$lib/server/db/schema-postgres';
import { desc, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

const listSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	search: z.string().max(500).optional(),
	jurisdiction: z.string().max(200).optional(),
	category: z.string().max(200).optional(),
});

const createSchema = z.object({
	title: z.string().trim().min(1).max(500),
	section: z.string().max(200).optional(),
	content: z.string().optional(),
	jurisdiction: z.string().max(200).optional(),
	category: z.string().max(200).optional(),
	effectiveDate: z.string().optional(),
	sourceUrl: z.string().url().max(2000).optional(),
});

const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

export const GET: RequestHandler = async ({ url, locals, request }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = listSchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) return json({ items: [], total: 0 }, { status: 400 });

	const { page, limit, search, jurisdiction, category } = parsed.data;

	try {
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) {
      conditions.push(
        or(ilike(statutes.title, `%${search}%`), ilike(statutes.section, `%${search}%`))
      );
    }
    if (jurisdiction) conditions.push(ilike(statutes.jurisdiction, `%${jurisdiction}%`));
    if (category) conditions.push(ilike(statutes.category, category));

    const where =
      conditions.length > 0 ? conditions.reduce((a, b) => sql`${a} AND ${b}`) : undefined;

    const [items, countResult] = await Promise.all([
      safe(
        db
          .select({
            id: statutes.id,
            title: statutes.title,
            section: statutes.section,
            content: statutes.content,
            jurisdiction: statutes.jurisdiction,
            category: statutes.category,
            effectiveDate: statutes.effectiveDate,
            sourceUrl: statutes.sourceUrl,
            createdAt: statutes.createdAt,
          })
          .from(statutes)
          .where(where)
          .orderBy(desc(statutes.updatedAt))
          .limit(limit)
          .offset(offset),
        []
      ),
      safe(
        db
          .select({ count: sql<number>`count(*)` })
          .from(statutes)
          .where(where)
          .then((r) => Number(r[0]?.count ?? 0)),
        0
      ),
    ]);

    const responseData = { items, total: countResult, page, limit };

    // ETag check for 304 response (reference data changes infrequently)
    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);

    return json(responseData, {
      headers: { ...cacheControl.long, ETag: etag }
    });
  } catch {
    return json({ items: [], total: 0, page, limit });
  }
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
			.insert(statutes)
			.values({
				title: parsed.data.title,
				section: parsed.data.section ?? null,
				content: parsed.data.content ?? null,
				jurisdiction: parsed.data.jurisdiction ?? null,
				category: parsed.data.category ?? null,
				effectiveDate: parsed.data.effectiveDate ? new Date(parsed.data.effectiveDate) : null,
				sourceUrl: parsed.data.sourceUrl ?? null,
			})
			.returning();
		return json({ item: created }, { status: 201 });
	} catch (err) {
		console.error('[POST /api/statutes]', err);
		return json({ error: 'Failed to create statute' }, { status: 500 });
	}
};
