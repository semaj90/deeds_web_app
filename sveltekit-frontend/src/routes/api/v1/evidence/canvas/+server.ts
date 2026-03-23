import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const canvasSaveSchema = z.object({
	caseId: z.string().uuid(),
	canvasData: z.any().optional(),
	evidenceNodes: z.array(z.any()).optional(),
	connections: z.array(z.any()).optional(),
	annotations: z.array(z.any()).optional(),
	timestamp: z.string().optional()
});

/** POST /api/v1/evidence/canvas — Save canvas state */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = canvasSaveSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message }, { status: 400 });
		}

		// Store in Redis for fast retrieval (canvas state is ephemeral)
		try {
			const { getRedis } = await import('$lib/server/redis.js');
			const redis = getRedis();
			const key = `canvas:${parsed.data.caseId}`;
			await redis.set(key, JSON.stringify(parsed.data), 'EX', 86400); // 24h TTL
		} catch {
			// Redis unavailable — canvas save is non-critical
		}

		return json({ success: true });
	} catch (err) {
		console.error('[/api/v1/evidence/canvas] error:', err);
		return json({ error: 'Failed to save canvas' }, { status: 500 });
	}
};