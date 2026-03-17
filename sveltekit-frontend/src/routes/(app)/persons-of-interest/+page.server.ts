import { db } from '$lib/server/db/client';
import { personsOfInterest } from '$lib/server/db/schema-postgres';
import { desc, eq, arrayContains } from 'drizzle-orm';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ url }) => {
	const id = url.searchParams.get('caseId') || null;

	const safe = <T>(p: Promise<T>, fallback: T, timeoutMs = 5000): Promise<T> =>
		Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs))]).catch(() => fallback);

	try {
		const query = id
			? db.select().from(personsOfInterest).where(arrayContains(personsOfInterest.caseIds, [id]))
			: db.select().from(personsOfInterest);

		const pois = await safe(query.orderBy(desc(personsOfInterest.createdAt)).limit(100).$withCache({ config: { ex: 60 } }), []);

		return {
			caseId: id,
			pois: pois.map((p) => ({
				id: p.id,
				name: p.name,
				status: p.status,
				threatLevel: p.threatLevel,
				description: p.description,
				relationship: p.relationship,
				caseIds: p.caseIds,
				createdAt: p.createdAt?.toISOString() ?? '',
				updatedAt: p.updatedAt?.toISOString() ?? ''
			}))
		};
	} catch (error) {
		console.error('Failed to load POIs:', error);
		return {
			caseId: id,
			pois: [],
			error: 'Failed to load persons of interest'
		};
	}
};
