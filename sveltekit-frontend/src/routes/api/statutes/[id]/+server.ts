/**
 * GET    /api/statutes/[id] — Get single statute
 * PUT    /api/statutes/[id] — Update statute
 * DELETE /api/statutes/[id] — Delete statute
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { statutes } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';
import { isUuid } from '$lib/server/validation.js';
import { z } from 'zod';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

const updateSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  section: z.string().max(200).optional(),
  content: z.string().optional(),
  jurisdiction: z.string().max(200).optional(),
  category: z.string().max(200).optional(),
  effectiveDate: z.string().optional(),
  sourceUrl: z.string().url().max(2000).optional(),
});

export const GET: RequestHandler = async ({ params, locals, request }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!isUuid(params.id)) return json({ item: null }, { status: 400 });

  try {
    const rows = await db.select().from(statutes).where(eq(statutes.id, params.id)).limit(1);
    if (!rows[0]) return json({ item: null }, { status: 404 });
    const responseData = { item: rows[0] };
    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);
    return json(responseData, { headers: { ...cacheControl.long, ETag: etag } });
  } catch (err) {
    console.error('[statutes/[id]] GET error:', err);
    return json({ item: null });
  }
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!isUuid(params.id)) return json({ error: 'Invalid ID' }, { status: 400 });

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const parsed = updateSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 });
	}

	try {
		const updates: Record<string, unknown> = {};
		if (parsed.data.title !== undefined) updates.title = parsed.data.title;
		if (parsed.data.section !== undefined) updates.section = parsed.data.section;
		if (parsed.data.content !== undefined) updates.content = parsed.data.content;
		if (parsed.data.jurisdiction !== undefined) updates.jurisdiction = parsed.data.jurisdiction;
		if (parsed.data.category !== undefined) updates.category = parsed.data.category;
		if (parsed.data.effectiveDate !== undefined) updates.effectiveDate = new Date(parsed.data.effectiveDate);
		if (parsed.data.sourceUrl !== undefined) updates.sourceUrl = parsed.data.sourceUrl;

		if (Object.keys(updates).length === 0) {
			return json({ error: 'No fields to update' }, { status: 400 });
		}

		const [updated] = await db
			.update(statutes)
			.set(updates)
			.where(eq(statutes.id, params.id))
			.returning();

		if (!updated) return json({ error: 'Not found' }, { status: 404 });
		return json({ item: updated });
	} catch (err) {
		console.error('[PUT /api/statutes/:id]', err);
		return json({ error: 'Update failed' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!isUuid(params.id)) return json({ error: 'Invalid ID' }, { status: 400 });

	try {
		const [deleted] = await db.delete(statutes).where(eq(statutes.id, params.id)).returning({ id: statutes.id });
		if (!deleted) return json({ error: 'Not found' }, { status: 404 });
		return json({ success: true, id: deleted.id });
	} catch (err) {
		console.error('[DELETE /api/statutes/:id]', err);
		return json({ error: 'Delete failed' }, { status: 500 });
	}
};
