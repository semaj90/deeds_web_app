import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';

const chargeSchema = z.object({
	caseId: z.string().uuid(),
	statuteCode: z.string().min(1).max(100),
	statuteTitle: z.string().max(500).optional(),
	query: z.string().max(500).optional()
});

/** POST /api/charges/add — Attach a statute/charge to a case */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = chargeSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { caseId, statuteCode, statuteTitle } = parsed.data;

		const { charges } = await import('$lib/server/db/schema-charges.js');

		const [charge] = await db
			.insert(charges)
			.values({
				caseId,
				statuteCode,
				statuteTitle: statuteTitle ?? null,
				isAttached: true
			})
			.returning();

		return json({ ok: true, charge });
	} catch (err) {
		console.error('[/api/charges/add] error:', err);
		return json({ ok: false, error: 'Failed to add charge' }, { status: 500 });
	}
};