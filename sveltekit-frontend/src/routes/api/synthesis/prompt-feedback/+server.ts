/**
 * POST /api/synthesis/prompt-feedback
 *
 * Records which contextual prompt pill the user clicked.
 * Lightweight write-only endpoint — no response body needed.
 *
 * Logged to:
 *   - console.info  (always — visible in server logs / Langfuse ingest)
 *   - Redis ZINCRBY (promptSource:section:prompt leaderboard, 30-day TTL)
 *
 * Body: {
 *   prompt:       string            — the pill text that was clicked
 *   promptSource: 'som' | 'keyword_fallback' | 'no_atlas'
 *   section:      string            — GlyphSection at click time
 *   confidence:   number            — HMM confidence at click time
 *   blended:      boolean           — was this a low-confidence blend?
 *   caseId?:      string
 * }
 *
 * Used to tune buildPrompts() section weights and BMU neighbour count.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getRedis } from '$lib/server/redis.js';

// ── Input schema ──────────────────────────────────────────────────────────────

const schema = z.object({
	prompt:       z.string().min(1).max(256),
	promptSource: z.enum(['som', 'keyword_fallback', 'no_atlas']),
	section:      z.string().max(64),
	confidence:   z.number().min(0).max(1),
	blended:      z.boolean(),
	caseId:       z.string().uuid().optional(),
});

// ── Redis leaderboard key ─────────────────────────────────────────────────────

/** 30-day TTL leaderboard for prompt quality tuning */
const LEADERBOARD_KEY = 'typing:prompt:clicks';
const LEADERBOARD_TTL = 30 * 24 * 3600;

// ── Handler ───────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	let raw: unknown;
	try { raw = await request.json(); }
	catch { return json({ error: 'Invalid JSON body' }, { status: 400 }); }

	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { prompt, promptSource, section, confidence, blended, caseId } = parsed.data;

	// Structured log — ingested by Langfuse / any log aggregator
	console.info('[typing-prompt-click]', JSON.stringify({
		prompt,
		promptSource,
		section,
		confidence: Number(confidence.toFixed(3)),
		blended,
		caseId:  caseId ?? null,
		userId:  String(locals.user.id),
		ts:      Date.now(),
	}));

	// Redis leaderboard — ZINCRBY sorted set, score = click count
	// Key structure: `${promptSource}::${section}::${prompt}` keeps scores queryable
	// by source and section without a secondary index.
	try {
		const redis = getRedis();
		const member = `${promptSource}::${section}::${prompt}`;
		await redis.zincrby(LEADERBOARD_KEY, 1, member);
		// Refresh TTL on every write so active prompts stay warm
		await redis.expire(LEADERBOARD_KEY, LEADERBOARD_TTL);
	} catch {
		// Redis unavailable — non-fatal; structured log still fires
	}

	return json({ ok: true });
};
