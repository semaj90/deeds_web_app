/** POST /api/chrrom/precompute — Generate CHR patterns for a given context */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { generateCHRPatterns } from '$lib/server/chrrom/patterns.js';
import type { PrecomputeContext } from '$lib/server/chrrom/patterns.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const ctx = (await request.json()) as PrecomputeContext;
		if (!ctx.userId) ctx.userId = locals.user.id;
		const patterns = await generateCHRPatterns(ctx);
		return json({ ok: true, patterns });
	} catch (err) {
		console.error('[chrrom/precompute] error:', err);
		return json({ ok: false, patterns: [] });
	}
};