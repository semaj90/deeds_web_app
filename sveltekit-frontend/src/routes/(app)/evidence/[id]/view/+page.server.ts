import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { isUuid } from '$lib/server/validation.js';

const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(303, `/login?redirect=/evidence/${params.id}/view`);

	if (!isUuid(params.id)) {
		return { item: null, loadError: 'Invalid evidence ID format' };
	}

	const rows = await safe(
		db.select().from(evidence).where(eq(evidence.id, params.id)).limit(1),
		[]
	);

	if (!rows[0]) {
		return { item: null, loadError: 'Evidence not found or database unavailable' };
	}

	return { item: rows[0], loadError: null };
};
