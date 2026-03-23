import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';

const relationshipSchema = z.object({
	poiId1: z.string().uuid(),
	poiId2: z.string().uuid(),
	type: z.enum(['family', 'business', 'friendship', 'conflict', 'unknown']).default('unknown'),
	strength: z.number().min(0).max(1).default(0.7)
});

/** POST /api/persons-of-interest/relationships — Create a POI relationship */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = relationshipSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { poiId1, poiId2, type, strength } = parsed.data;

		const { poiRelationships } = await import('$lib/server/db/schema.js');

		const [relationship] = await db
			.insert(poiRelationships)
			.values({
				poiId1,
				poiId2,
				relationshipType: type,
				strength: String(strength)
			})
			.returning();

		return json({ relationship });
	} catch (err) {
		console.error('[/api/persons-of-interest/relationships] error:', err);
		return json({ error: 'Failed to create relationship' }, { status: 500 });
	}
};