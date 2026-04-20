/**
 * POST /api/codeintel/wiki
 *
 * Generate a wiki-style article about any query using ACE codebase context.
 * Clusters + code chunks are pulled from Postgres; Gemma4 assembles the article.
 *
 * Request body: { query, repoId?, clusterIds?, maxWords?, task? }
 * Response:     AceWikiResult — same shape on success and degraded paths.
 *
 * Status codes:
 *   200 — ok: true, degraded: false
 *   207 — ok: false or degraded: true (partial/heuristic result still returned)
 *   400 — validation failure (bad input)
 *   401 — not authenticated
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const wikiSchema = z.object({
	query: z.string().min(1, 'query is required').max(500, 'query must be ≤ 500 characters').trim(),
	repoId: z.string().max(100).optional(),
	clusterIds: z.array(z.number().int().min(0)).max(10).optional(),
	maxWords: z.number().int().min(100).max(1200).optional(),
	task: z.enum(['explain', 'troubleshoot', 'overview', 'deep-dive']).optional(),
});

const DEGRADED_WIKI = {
	ok: false,
	title: null,
	summary: null,
	sections: [] as { heading: string; content: string }[],
	relatedFiles: [] as string[],
	relatedClusters: [] as number[],
	degraded: true,
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json(
			{ ...DEGRADED_WIKI, query: '', errors: ['Unauthorized'], latencyMs: 0 },
			{ status: 401 },
		);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	const parsed = wikiSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{
				...DEGRADED_WIKI,
				query: '',
				errors: [parsed.error.issues[0]?.message ?? 'Invalid request body'],
				latencyMs: 0,
			},
			{ status: 400 },
		);
	}

	try {
		const { generateAceWiki } = await import('$lib/server/ace/ace-wiki.js');
		const result = await generateAceWiki(parsed.data);
		return json(result, { status: result.degraded ? 207 : 200 });
	} catch (e: unknown) {
		console.error('[/api/codeintel/wiki]', e instanceof Error ? e.message : String(e));
		return json(
			{
				...DEGRADED_WIKI,
				query: parsed.data.query,
				errors: ['Wiki generation unavailable.'],
				latencyMs: 0,
			},
			{ status: 207 },
		);
	}
};
