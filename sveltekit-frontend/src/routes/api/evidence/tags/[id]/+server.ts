import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { vlmImageTags } from '$lib/server/db/schema-postgres.js';
import { eq, sql } from 'drizzle-orm';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/evidence/tags/:id  — fetch one tag by UUID, increment hit_count */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ tag: null }, { status: 401 });
	if (!UUID_RE.test(params.id)) return json({ tag: null }, { status: 400 });

	try {
		const [tag] = await db
			.update(vlmImageTags)
			.set({ hitCount: sql`${vlmImageTags.hitCount} + 1`, updatedAt: sql`now()` })
			.where(eq(vlmImageTags.id, params.id))
			.returning();
		return json({ tag: tag ?? null });
	} catch {
		const rows = await db
			.select()
			.from(vlmImageTags)
			.where(eq(vlmImageTags.id, params.id))
			.limit(1)
			.catch(() => []);
		return json({ tag: rows[0] ?? null });
	}
};
