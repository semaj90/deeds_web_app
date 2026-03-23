import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { evidenceRelationships } from '$lib/server/db/schema-postgres.js';
import { eq, and, or } from 'drizzle-orm';

const createRelationshipSchema = z.object({
	caseId: z.string().uuid(),
	fromEvidenceId: z.string().uuid(),
	toEvidenceId: z.string().uuid(),
	relationshipType: z.string().min(1).max(50),
	strength: z.string().max(20).default('medium'),
	label: z.string().max(255).optional()
});

/** GET /api/evidence/relationships — List relationships for a case/evidence item */
export const GET: RequestHandler = async ({ url }) => {
	const caseId = url.searchParams.get('caseId');
	const evidenceId = url.searchParams.get('evidenceId');

	if (!caseId) {
		return json({ message: 'caseId required' }, { status: 400 });
	}

	try {
		let query = db.select().from(evidenceRelationships).where(eq(evidenceRelationships.caseId, caseId));

		if (evidenceId) {
			query = db
				.select()
				.from(evidenceRelationships)
				.where(
					and(
						eq(evidenceRelationships.caseId, caseId),
						or(
							eq(evidenceRelationships.fromEvidenceId, evidenceId),
							eq(evidenceRelationships.toEvidenceId, evidenceId)
						)
					)
				);
		}

		const rows = await query;
		return json({ relationships: rows });
	} catch (err) {
		console.error('[/api/evidence/relationships] GET error:', err);
		return json({ relationships: [], error: 'Failed to load relationships' }, { status: 500 });
	}
};

/** POST /api/evidence/relationships — Create a relationship between evidence items */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = createRelationshipSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ message: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { caseId, fromEvidenceId, toEvidenceId, relationshipType, strength, label } =
			parsed.data;

		const [created] = await db
			.insert(evidenceRelationships)
			.values({
				caseId,
				fromEvidenceId,
				toEvidenceId,
				relationshipType: relationshipType as any,
				strength,
				label: label ?? relationshipType.replace(/_/g, ' ')
			})
			.returning();

		return json(created, { status: 201 });
	} catch (err) {
		console.error('[/api/evidence/relationships] POST error:', err);
		return json({ message: 'Failed to create relationship' }, { status: 500 });
	}
};
