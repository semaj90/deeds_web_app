import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { vlmImageTags } from '$lib/server/db/schema-postgres.js';
import { ilike, desc, sql } from 'drizzle-orm';
import { z } from 'zod';

const TAG_SOURCE_VALUES = [
  'manual', 'vlm', 'ner', 'user', 'auto', 'import',
] as const;

const PostSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  source:      z.enum(TAG_SOURCE_VALUES).default('manual'),
});

/** GET /api/evidence/tags?name=foo&limit=20
 *  Lookup one tag by name or list top tags by hit_count.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const name  = url.searchParams.get('name');
	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);

	try {
		if (name) {
			const rows = await db
				.select()
				.from(vlmImageTags)
				.where(ilike(vlmImageTags.name, name.trim()))
				.limit(1);
			if (!rows[0]) return json({ tag: null });
			return json({ tag: rows[0] });
		}

		const rows = await db
			.select()
			.from(vlmImageTags)
			.orderBy(desc(vlmImageTags.hitCount))
			.limit(limit);
		return json({ tags: rows });
	} catch {
		return json({ tag: null, tags: [] });
	}
};

/** POST /api/evidence/tags  — upsert a tag (name + optional description) */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	let rawBody: unknown;
	try { rawBody = await request.json(); } catch { return json({ error: 'Invalid JSON' }, { status: 400 }); }

	const parsed = PostSchema.safeParse(rawBody);
	if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Bad request' }, { status: 400 });

	const { name, description, source } = parsed.data;

	try {
		const [tag] = await db
			.insert(vlmImageTags)
			.values({ name: name.trim().toLowerCase(), description, source })
			.onConflictDoUpdate({
				target: vlmImageTags.name,
				set: {
					description: sql`COALESCE(EXCLUDED.description, vlm_image_tags.description)`,
					updatedAt:   sql`now()`,
				},
			})
			.returning();
		return json({ tag });
	} catch (err) {
		return json({ error: String(err) }, { status: 500 });
	}
};
