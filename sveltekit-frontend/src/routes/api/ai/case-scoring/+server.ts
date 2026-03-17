import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { z } from 'zod';

const caseScoringSchema = z.object({
	caseId: z.string().min(1, 'caseId required').max(500)
});

/** POST /api/ai/case-scoring — Evidence-weighted case strength scoring */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const parsed = caseScoringSchema.safeParse(await request.json());
		if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		const { caseId: id } = parsed.data;

		const { cases, evidence, personsOfInterest } = await import('$lib/server/db/schema');
		const { eq, count, sql } = await import('drizzle-orm');

		const [caseRow] = await db.select().from(cases).where(eq(cases.id, id)).limit(1);
		if (!caseRow) return json({ error: 'Case not found' }, { status: 404 });

		const [evidenceCount] = await db
			.select({ count: count() })
			.from(evidence)
			.where(eq(evidence.caseId, id));

		const { arrayContains } = await import('drizzle-orm');
		const [poiCount] = await db
			.select({ count: count() })
			.from(personsOfInterest)
			.where(arrayContains(personsOfInterest.caseIds, [id]));

		const evCount = Number(evidenceCount?.count || 0);
		const persons = Number(poiCount?.count || 0);

		// Evidence-weighted scoring
		const evidenceScore = Math.min(evCount * 10, 40); // max 40 pts
		const witnessScore = Math.min(persons * 8, 24);    // max 24 pts
		const documentationScore = caseRow.description ? 15 : 5;
		const isActive = caseRow.status === 'open' || caseRow.status === 'in_progress';
		const statusBonus = isActive ? 10 : 0;
		const totalScore = Math.min(evidenceScore + witnessScore + documentationScore + statusBonus, 100);

		return json({
			caseId: id,
			caseTitle: caseRow.title,
			score: totalScore,
			breakdown: {
				evidence: { count: evCount, score: evidenceScore, max: 40 },
				witnesses: { count: persons, score: witnessScore, max: 24 },
				documentation: { score: documentationScore, max: 15 },
				statusBonus: { active: isActive, score: statusBonus, max: 10 }
			},
			grade: totalScore >= 80 ? 'A' : totalScore >= 60 ? 'B' : totalScore >= 40 ? 'C' : totalScore >= 20 ? 'D' : 'F'
		});
	} catch (err) {
		console.error('[/api/ai/case-scoring]', err);
		return json({ error: 'Scoring failed' }, { status: 500 });
	}
};
