/** POST /api/chrrom/events — Record user action, predict next, push CHR patterns */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { predictor, mapActionToCHRContext } from '$lib/server/chrrom/predictor.js';
import { generateCHRPatterns } from '$lib/server/chrrom/patterns.js';
import { broadcastPatterns } from '$lib/server/chrrom/bus.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const body = await request.json();
		const userId = body.userId || locals.user.id || 'anonymous';
		const action = body.action;
		const topK = Math.min(Math.max(body.topK ?? 2, 1), 5);

		if (!action || typeof action !== 'string') {
			return json({ error: 'action is required' }, { status: 400 });
		}

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
