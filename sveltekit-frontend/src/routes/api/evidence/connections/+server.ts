import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { evidenceRelationships } from '$lib/server/db/schema-postgres.js';

const connectionSchema = z.object({
	fromNodeId: z.string().uuid(),
	toNodeId: z.string().uuid(),
	caseId: z.string().uuid(),
	strength: z.number().min(0).max(1).default(0.5)
});

/** POST /api/evidence/connections — Create a board-level connection between evidence nodes */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = connectionSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ message: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { fromNodeId, toNodeId, caseId, strength } = parsed.data;

		const strengthLabel =
			strength >= 0.75 ? 'strong' : strength >= 0.4 ? 'medium' : 'weak';

		const [created] = await db
			.insert(evidenceRelationships)
			.values({
				caseId,
				fromEvidenceId: fromNodeId,
				toEvidenceId: toNodeId,
				relationshipType: 'related' as typeof evidenceRelationships.relationshipType.enumValues[number],
				strength: strengthLabel,
				label: 'board connection'
			})
			.returning();

		return json({
			id: created.id,
			fromNodeId,
			toNodeId,
			caseId,
			strength,
			createdAt: created.createdAt
		}, { status: 201 });
	} catch (err) {
		console.error('[/api/evidence/connections] POST error:', err);
		return json({ message: 'Failed to create connection' }, { status: 500 });
	}
};
