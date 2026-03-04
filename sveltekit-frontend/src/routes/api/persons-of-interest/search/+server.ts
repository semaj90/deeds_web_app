import { db } from '$lib/server/db/client';
import { personsOfInterest } from '$lib/server/db/schema-postgres';
import { json, error } from '@sveltejs/kit';
import { sql, ne, desc } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * POST /api/persons-of-interest/search
 * Search for similar persons of interest using text matching + optional vector similarity
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await request.json();
	const query = body.query?.trim();
	if (!query) throw error(400, 'Missing query');

	const limit = Math.min(body.limit ?? 10, 50);
	const excludeId = body.excludeId ?? null;

	try {
		// Text-based similarity search across name, description, aliases
		const searchTerm = `%${query.toLowerCase()}%`;

		const results = await db
			.select({
				id: personsOfInterest.id,
				name: personsOfInterest.name,
				status: personsOfInterest.status,
				threatLevel: personsOfInterest.threatLevel,
				description: personsOfInterest.description,
				aliases: personsOfInterest.aliases,
				relationship: personsOfInterest.relationship,
			})
			.from(personsOfInterest)
			.where(
				sql`(
					lower(${personsOfInterest.name}) LIKE ${searchTerm}
					OR lower(coalesce(${personsOfInterest.description}, '')) LIKE ${searchTerm}
					OR lower(coalesce(${personsOfInterest.relationship}, '')) LIKE ${searchTerm}
					OR EXISTS (
						SELECT 1 FROM unnest(${personsOfInterest.aliases}) alias
						WHERE lower(alias) LIKE ${searchTerm}
					)
				)${excludeId ? sql` AND ${personsOfInterest.id} != ${excludeId}` : sql``}`
			)
			.orderBy(desc(personsOfInterest.updatedAt))
			.limit(limit);

		// Score results by match quality
		const scored = results.map((r) => {
			let score = 0;
			const q = query.toLowerCase();
			if (r.name.toLowerCase().includes(q)) score += 0.8;
			if (r.name.toLowerCase() === q) score += 0.2;
			if (r.description?.toLowerCase().includes(q)) score += 0.4;
			if (r.relationship?.toLowerCase().includes(q)) score += 0.2;
			const aliases = r.aliases ?? [];
			if (aliases.some((a) => a.toLowerCase().includes(q))) score += 0.6;
			return {
				poiId: r.id,
				name: r.name,
				status: r.status,
				threatLevel: r.threatLevel,
				description: r.description?.slice(0, 200) ?? '',
				lastLocation: null, // TODO: Add when location column exists
				photoUrl: null, // TODO: Join poi_photos + VLM analysis
				similarityScore: Math.min(score, 1.0),
			};
		});

		scored.sort((a, b) => b.similarityScore - a.similarityScore);

		return json(scored);
	} catch (err) {
		console.error('POI search error:', err);
		return json([], { status: 200 });
	}
};
