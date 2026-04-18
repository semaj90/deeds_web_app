/**
 * GET /api/analytics/prompt-leaderboard
 *
 * Returns the top prompts from the Redis `typing:prompt:clicks` sorted set,
 * written by POST /api/synthesis/prompt-feedback.
 *
 * Member format: `${promptSource}::${section}::${prompt}`
 * Score = cumulative click count (ZINCRBY).
 *
 * Query params:
 *   section?  string  — filter to a specific practice-area section
 *   limit?    number  — max entries to return (default 50, max 200)
 *
 * Response: { entries: LeaderboardEntry[]; total: number; sections: string[] }
 *
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getRedis } from '$lib/server/redis.js';

const LEADERBOARD_KEY = 'typing:prompt:clicks';

const querySchema = z.object({
	section: z.string().max(100).optional(),
	limit:   z.coerce.number().int().min(1).max(200).default(50),
});

export interface LeaderboardEntry {
	prompt:       string;
	promptSource: string;
	section:      string;
	clicks:       number;
	rank:         number;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ entries: [], total: 0, sections: [] }, { status: 401 });
	}

	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ entries: [], total: 0, sections: [] }, { status: 400 });
	}
	const { section: sectionFilter, limit } = parsed.data;

	try {
		const redis = getRedis();

		// ZREVRANGE with WITHSCORES returns [member, score, member, score, ...]
		const raw: string[] = await redis.zrevrange(LEADERBOARD_KEY, 0, -1, 'WITHSCORES');

		const allEntries: (LeaderboardEntry & { _score: number })[] = [];
		for (let i = 0; i < raw.length; i += 2) {
			const member = raw[i];
			const score  = parseFloat(raw[i + 1]);
			// Format: promptSource::section::prompt (section may contain ::)
			const firstSep  = member.indexOf('::');
			const secondSep = member.indexOf('::', firstSep + 2);
			if (firstSep === -1 || secondSep === -1) continue;

			const promptSource = member.slice(0, firstSep);
			const section      = member.slice(firstSep + 2, secondSep);
			const prompt       = member.slice(secondSep + 2);

			if (sectionFilter && section !== sectionFilter) continue;

			allEntries.push({ promptSource, section, prompt, clicks: score, rank: 0, _score: score });
		}

		// Rank within the filtered set
		allEntries.sort((a, b) => b._score - a._score);
		const entries: LeaderboardEntry[] = allEntries
			.slice(0, limit)
			.map(({ _score: _, ...entry }, i) => ({ ...entry, rank: i + 1 }));

		// Unique sections (from full set, not just filtered)
		const sections = [...new Set(allEntries.map((e) => e.section))].sort();

		return json({ entries, total: allEntries.length, sections });
	} catch (err) {
		console.error('[prompt-leaderboard] Error:', err);
		return json({ entries: [], total: 0, sections: [] });
	}
};
