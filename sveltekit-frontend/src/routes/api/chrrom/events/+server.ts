/** POST /api/chrrom/events — Record user action, predict next, push CHR patterns */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { predictor, mapActionToCHRContext } from '$lib/server/chrrom/predictor.js';
import { generateCHRPatterns } from '$lib/server/chrrom/patterns.js';
import { broadcastPatterns } from '$lib/server/chrrom/bus.js';

const chrromEventSchema = z.object({
	action: z.string().min(1, 'action is required').max(200),
	userId: z.string().optional(),
	topK: z.number().int().min(1).max(5).optional().default(2)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const body = await request.json();
		const parsed = chrromEventSchema.safeParse(body);

		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { action, userId = locals.user.id || 'anonymous', topK = 2 } = parsed.data;

		// Record action in Markov predictor
		await predictor.recordAction(userId, action);

		// Predict next likely actions
		const predictions = predictor.predictTopN(action, topK);

		// Generate CHR patterns for predicted actions
		const patterns: any[] = [];
		for (const pred of predictions) {
			if (!pred.action) continue;
			const ctx = { userId, ...mapActionToCHRContext(pred.action) };
			if (ctx.docId || ctx.query) {
				const ps = await generateCHRPatterns(ctx);
				patterns.push(...ps);
			}
		}

		// Broadcast patterns to connected SSE clients
		if (patterns.length) {
			broadcastPatterns(patterns);
		}

		return json({ ok: true, predictions, pushed: patterns.length });
	} catch (err) {
		console.error('[chrrom/events] error:', err);
		return json({ ok: false, predictions: [], pushed: 0 });
	}
};
