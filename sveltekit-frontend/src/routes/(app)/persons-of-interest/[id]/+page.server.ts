import { db } from '$lib/server/db/client';
import { personsOfInterest } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params }) => {
	try {
		const results = await db
			.select()
			.from(personsOfInterest)
			.where(eq(personsOfInterest.id, params.id))
			.limit(1);

		const poi = results[0];

		if (!poi) {
			return error(404, 'Person of interest not found');
		}

		return {
			poi: {
				id: poi.id,
				name: poi.name,
				status: poi.status,
				threatLevel: poi.threatLevel,
				description: poi.description,
				lastLocation: poi.lastLocation,
				lastSeen: poi.lastSeen,
				aliases: poi.aliases,
				caseId: poi.caseId,
				photos: poi.photos,
				ai: poi.ai,
				createdAt: poi.createdAt?.toISOString() ?? '',
				updatedAt: poi.updatedAt?.toISOString() ?? ''
			}
		};
	} catch (err) {
		console.error('Failed to load POI:', err);
		return error(500, 'Failed to load person of interest');
	}
};
