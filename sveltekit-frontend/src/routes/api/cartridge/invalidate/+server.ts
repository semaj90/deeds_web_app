/**
 * CHR-ROM97 Cartridge Cache Invalidation API
 *
 * POST { caseId }
 * → Deletes cached cartridge from Redis
 * → Use after new evidence upload to force rebuild
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { invalidateCartridge } from '$lib/server/cache/cartridge-tensor-bridge.js';
import { z } from 'zod';

const invalidateSchema = z.object({
	caseId: z.string().min(1).max(500),
});

export const POST: RequestHandler = async ({ request }) => {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = invalidateSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { caseId } = parsed.data;

	try {
		const deleted = await invalidateCartridge(caseId);
		return json({ caseId, invalidated: deleted });
	} catch (err) {
		console.error('[cartridge-invalidate] Error:', err);
		return json({ error: 'Invalidation failed' }, { status: 500 });
	}
};
