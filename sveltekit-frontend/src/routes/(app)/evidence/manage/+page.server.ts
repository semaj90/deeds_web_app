import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user ?? null;

	const files = await safe(
		db.select({
			id: evidence.id,
			title: evidence.title,
			evidenceType: evidence.evidenceType,
			fileSize: evidence.fileSize,
			createdAt: evidence.createdAt,
		})
			.from(evidence)
			.orderBy(desc(evidence.createdAt))
			.limit(100),
		[]
	);

	return { files, user, loadError: null };
};