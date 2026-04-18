/**
 * /api/analytics/research-summaries
 *
 * GET  — paginated browse with DYM + Fuse.js index
 *   Params:
 *     source?   web|corpus|document|image|video|report|note|case|all  (default all)
 *     pipeline? ace|rag|kag|dag|codebase|all                          (default all)
 *     tags?     comma-separated entity tags (AND filter)
 *     query?    free-text for DYM suggestions (pg_trgm)
 *     sortBy?   relevance|date                                          (default relevance)
 *     limit?    1-100                                                   (default 25)
 *     cursor?   keyset cursor from previous response
 *     page?     jump to logical page (resets cursor from Redis state)
 *   Returns: BrowsePage (summaries, nextCursor, total, page, totalPages, didYouMean, fuseIndex)
 *
 * POST — persist a summary row (from crawler or ingest pipeline)
 *   Body: NewResearchSummary (subset — id/createdAt generated server-side)
 *
 * GET /did-you-mean — standalone DYM endpoint, paginated top-100
 *   Params: query, page?, limit?
 *
 * Auth: requires locals.user (GET returns empty on anon, POST returns 401)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
	browseResearchSummaries,
	persistResearchSummary,
	getTopEntityTags,
	getDidYouMeanPage,
	type BrowseFilters,
} from '$lib/server/analytics/research-summaries-db.js';

const SOURCES   = ['web', 'corpus', 'document', 'image', 'video', 'report', 'note', 'case', 'all'] as const;
const PIPELINES = ['ace', 'rag', 'kag', 'dag', 'codebase', 'all'] as const;

const postSchema = z.object({
	source:         z.enum(SOURCES).exclude(['all']),
	pipeline:       z.enum(PIPELINES).exclude(['all']).default('ace'),
	entityType:     z.string().max(30).optional(),
	query:          z.string().min(3).max(400),
	queryHash:      z.string().length(8).optional(),
	title:          z.string().max(500).optional(),
	url:            z.string().max(2000).optional(),
	collection:     z.string().max(100).optional(),
	citationLabel:  z.string().max(300).optional(),
	sectionPath:    z.string().max(300).optional(),
	jurisdiction:   z.string().max(100).optional(),
	summary:        z.string().min(10).max(4000),
	entityTags:     z.array(z.string().max(60)).max(12).default([]),
	relevanceScore: z.number().min(0).max(1).default(0),
});

// ── GET — browse ──────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) {
		return json({
			summaries: [], nextCursor: null, prevCursor: null,
			total: 0, page: 1, totalPages: 1, didYouMean: [], fuseIndex: [],
			topTags: [],
		});
	}

	// DYM-only shortcut: ?mode=dym
	if (url.searchParams.get('mode') === 'dym') {
		const q        = url.searchParams.get('query') ?? '';
		const page     = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
		const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '25')));
		const result   = await getDidYouMeanPage(q, page, pageSize);
		return json(result);
	}

	// Tags autocomplete shortcut: ?mode=tags
	if (url.searchParams.get('mode') === 'tags') {
		const tags = await getTopEntityTags(50);
		return json({ tags });
	}

	const rawTags = url.searchParams.get('tags') ?? '';
	const filters: BrowseFilters = {
		source:   url.searchParams.get('source')   ?? 'all',
		pipeline: url.searchParams.get('pipeline') ?? 'all',
		tags:     rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : [],
		query:    url.searchParams.get('query')    ?? '',
		sortBy:   (url.searchParams.get('sortBy') ?? 'relevance') as 'relevance' | 'date',
		limit:    Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '25'))),
		cursor:   url.searchParams.get('cursor')   ?? null,
	};

	try {
		const page = await browseResearchSummaries(filters, locals.user.id);
		// Fetch top tags for filter bar autocomplete (cached by getTopEntityTags)
		const topTags = await getTopEntityTags(30).catch(() => [] as string[]);
		return json({ ...page, topTags });
	} catch {
		return json({
			summaries: [], nextCursor: null, prevCursor: null,
			total: 0, page: 1, totalPages: 1, didYouMean: [], fuseIndex: [],
			topTags: [],
		});
	}
};

// ── POST — persist ────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw    = await request.json().catch(() => ({}));
	const parsed = postSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const d = parsed.data;

	// Compute queryHash FNV-1a if not supplied
	function fnv1a(text: string): string {
		let h = 2166136261;
		for (let i = 0; i < Math.min(text.length, 512); i++) {
			h ^= text.charCodeAt(i);
			h = Math.imul(h, 16777619) >>> 0;
		}
		return h.toString(16).padStart(8, '0');
	}

	await persistResearchSummary({
		source:        d.source,
		pipeline:      d.pipeline,
		entityType:    d.entityType ?? d.source,
		query:         d.query,
		queryHash:     d.queryHash ?? fnv1a(d.query),
		title:         d.title ?? null,
		url:           d.url ?? null,
		collection:    d.collection ?? null,
		citationLabel: d.citationLabel ?? null,
		sectionPath:   d.sectionPath ?? null,
		jurisdiction:  d.jurisdiction ?? null,
		summary:       d.summary,
		entityTags:    d.entityTags,
		relevanceScore: d.relevanceScore,
		userId:        locals.user.id,
	});

	return json({ saved: true });
};