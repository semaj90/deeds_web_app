/** POST /api/chrrom/precompute — Generate CHR patterns for a given context */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { generateCHRPatterns } from '$lib/server/chrrom/patterns.js';
import type { PrecomputeContext } from '$lib/server/chrrom/patterns.js';

const precomputeContextSchema = z.object({
	userId: z.string().optional(),
	sessionId: z.string().optional(),
	caseId: z.string().optional(),
	docId: z.string().optional(),
	query: z.string().max(1000).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const body = await request.json();
		const parsed = precomputeContextSchema.safeParse(body);

		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const ctx: PrecomputeContext = { ...parsed.data };
		if (!ctx.userId) ctx.userId = locals.user.id;
		const patterns = await generateCHRPatterns(ctx);
		return json({ ok: true, patterns });
	} catch (err) {
		console.error('[chrrom/precompute] error:', err);
		return json({ ok: false, patterns: [] });
	}
};
