/**
 * GET /api/chat/replay?conversationId=xxx&fromId=0-0&count=100
 *
 * Replays token chunks from a Redis Stream for SSE crash recovery.
 * When a client reconnects after a dropped SSE connection, it can
 * fetch missed tokens from this endpoint to reconstruct the response.
 */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { readTokenStream } from '$lib/server/redis-streams.js';
import { z } from 'zod';

const replaySchema = z.object({
	conversationId: z.string().min(1).max(200),
	fromId: z.string().max(50).default('0-0'),
	count: z.coerce.number().int().min(1).max(1000).default(100),
});

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = replaySchema.safeParse({
		conversationId: url.searchParams.get('conversationId'),
		fromId: url.searchParams.get('fromId') ?? '0-0',
		count: url.searchParams.get('count') ?? '100',
	});

	if (!parsed.success) {
		return json({ error: 'Invalid parameters', details: parsed.error.flatten() }, { status: 400 });
	}

	const { conversationId, fromId, count } = parsed.data;

	try {
		const entries = await readTokenStream(conversationId, fromId, count);

		// Reconstruct the full text from sequential chunks
		const fullText = entries.map((e) => e.chunk).join('');

		return json({
			conversationId,
			entries: entries.length,
			lastId: entries.length > 0 ? entries[entries.length - 1].id : fromId,
			text: fullText,
		});
	} catch (err) {
		console.error('[chat/replay] Redis stream read failed:', (err as Error).message);
		return json({
      conversationId,
      entries: 0,
      lastId: fromId,
      text: '',
    });
	}
};
