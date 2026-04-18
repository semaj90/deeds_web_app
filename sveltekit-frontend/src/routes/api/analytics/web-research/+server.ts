/**
 * /api/analytics/web-research
 *
 * POST — crawl: run web research for one or more selfPrompt queries
 *   Body: { selfPrompts: string[], pipeline?: string, maxResults?: number }
 *   Returns: { batches: WebResearchBatch[], totalSummaries: number, indexedAt: string }
 *
 * GET  — query: return cached summaries from Redis index
 *   Params: pipeline? (default 'all'), limit? (default 20)
 *   Returns: { summaries: WebResearchSummary[], stats: { builtAt, totalByPipeline } }
 *
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
	crawlWebResearch,
	queryWebResearchIndex,
	getWebResearchStats,
	invalidateWebResearchCache,
	crawlLegalCorpus,
	queryCorpusIndex,
	getCorpusSearchStats,
	invalidateCorpusCache,
} from '$lib/server/analytics/web-research-crawler.js';

const postSchema = z.object({
	selfPrompts: z.array(z.string().min(3).max(400)).min(1).max(10),
	pipeline:   z.enum(['ace', 'rag', 'kag', 'dag', 'codebase', 'all']).default('ace'),
	maxResults: z.number().int().min(1).max(10).default(5),
	action:     z.enum(['crawl', 'corpus-search', 'invalidate']).default('crawl'),
});

// ── GET — cached summaries (web + corpus) ────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) {
		return json({ summaries: [], corpusSummaries: [], stats: { builtAt: null, totalByPipeline: {} }, corpusStats: { builtAt: null, totalByPipeline: {} } });
	}

	const pipeline = (url.searchParams.get('pipeline') ?? 'all') as string;
	const limit    = Math.min(Number(url.searchParams.get('limit') ?? '20'), 50);
	const source   = url.searchParams.get('source') ?? 'web'; // 'web' | 'corpus' | 'all'

	try {
		const results = await Promise.all([
			source !== 'corpus' ? queryWebResearchIndex(pipeline, limit) : Promise.resolve([]),
			source !== 'corpus' ? getWebResearchStats() : Promise.resolve({ builtAt: null, totalByPipeline: {} }),
			source !== 'web'    ? queryCorpusIndex(pipeline, limit)    : Promise.resolve([]),
			source !== 'web'    ? getCorpusSearchStats()               : Promise.resolve({ builtAt: null, totalByPipeline: {} }),
		]);
		return json({ summaries: results[0], stats: results[1], corpusSummaries: results[2], corpusStats: results[3] });
	} catch {
		return json({ summaries: [], corpusSummaries: [], stats: { builtAt: null, totalByPipeline: {} }, corpusStats: { builtAt: null, totalByPipeline: {} } });
	}
};

// ── POST — crawl or invalidate ────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw    = await request.json().catch(() => ({}));
	const parsed = postSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { action, selfPrompts, pipeline, maxResults } = parsed.data;

	// ── Invalidate ──────────────────────────────────────────────────────────────
	if (action === 'invalidate') {
		await Promise.all([
			invalidateWebResearchCache().catch(() => {}),
			invalidateCorpusCache().catch(() => {}),
		]);
		return json({ cleared: true });
	}

	// ── Corpus search — query local Qdrant legal collections ────────────────────
	if (action === 'corpus-search') {
		const batches = [];
		let totalSummaries = 0;
		for (const query of selfPrompts) {
			try {
				const batch = await crawlLegalCorpus(query, pipeline, maxResults);
				batches.push(batch);
				totalSummaries += batch.summaries.length;
			} catch { /* non-fatal */ }
		}
		return json({ batches, totalSummaries, source: 'corpus', indexedAt: new Date().toISOString() });
	}

	// ── Crawl web — run sequentially to avoid hammering search providers ────────
	const batches = [];
	let totalSummaries = 0;

	for (const query of selfPrompts) {
		try {
			const batch = await crawlWebResearch(query, pipeline, maxResults);
			batches.push(batch);
			totalSummaries += batch.summaries.length;
		} catch {
			// Non-fatal — skip this prompt
		}
	}

	return json({
		batches,
		totalSummaries,
		source: 'web',
		indexedAt: new Date().toISOString(),
	});
};
