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
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { researchSummaries, citations } from '$lib/server/db/schema-postgres.js';
import {
	browseResearchSummaries,
	persistResearchSummary,
	getTopEntityTags,
	getDidYouMeanPage,
	type BrowseFilters,
} from '$lib/server/analytics/research-summaries-db.js';

// Persist enum types — must be a concrete source/pipeline (not 'all')
const PERSIST_SOURCES   = ['web', 'corpus', 'document', 'image', 'video', 'report', 'note', 'case'] as const;
const PERSIST_PIPELINES = ['ace', 'rag', 'kag', 'dag', 'codebase'] as const;

// Save-citation action schema — promote a research summary to a saved citation
const saveCitationSchema = z.object({
	action:    z.literal('save_citation'),
	summaryId: z.string().uuid(),
	caseId:    z.string().uuid().optional(),
	annotation: z.string().max(2000).optional(),
});

const postSchema = z.object({
	source:         z.enum(PERSIST_SOURCES),
	pipeline:       z.enum(PERSIST_PIPELINES).default('ace'),
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
			policyWeights: { ace: 1, kag: 1, dag: 1, rag: 1, codebase: 1, updatedAt: null },
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
			policyWeights: { ace: 1, kag: 1, dag: 1, rag: 1, codebase: 1, updatedAt: null },
		});
	}
};

// ── POST — persist summary OR save as citation ────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json().catch(() => ({}));

	// ── save_citation action: promote existing summary → citations table ──────
	if ((raw as Record<string, unknown>).action === 'save_citation') {
		const parsed = saveCitationSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { summaryId, caseId, annotation } = parsed.data;

		// Fetch the summary
		const rows = await db
			.select()
			.from(researchSummaries)
			.where(eq(researchSummaries.id, summaryId))
			.limit(1)
			.catch(() => []);

		const summary = rows[0];
		if (!summary) return json({ error: 'Summary not found' }, { status: 404 });

		// Already saved?
		if (summary.savedCitationId) {
			return json({ citationId: summary.savedCitationId, alreadySaved: true });
		}

		// Create citation row
		const [newCitation] = await db
			.insert(citations)
			.values({
				citationText:   summary.citationLabel ?? summary.title ?? summary.query.slice(0, 200),
				citationType:   summary.source,
				title:          summary.title ?? null,
				annotation:     annotation ?? summary.summary.slice(0, 1000),
				isKeyAuthority: false,
				tags:           summary.entityTags,
				sourceUrl:      summary.url ?? null,
				caseId:         caseId ?? null,
				createdBy:      locals.user.id,
			})
			.returning();

		// Link back to research_summaries
		await db
			.update(researchSummaries)
			.set({ savedCitationId: newCitation.id })
			.where(eq(researchSummaries.id, summaryId));

		// RL signal: citation_saved is the strongest positive reward (+0.05)
		import('$lib/server/graph/hypergraph-4d.js')
			.then(({ adaptFromAnalytics }) =>
				adaptFromAnalytics({
					signal:    'citation_saved',
					pipeline:  summary.pipeline ?? 'ace',
					userId:    locals.user.id,
					sessionId: locals.user.id,
				})
			)
			.catch(() => {});

		return json({ citationId: newCitation.id, citation: newCitation });
	}

	// ── Standard persist ──────────────────────────────────────────────────────
	const parsed = postSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const d = parsed.data;

	function fnv1a(text: string): string {
		let h = 2166136261;
		for (let i = 0; i < Math.min(text.length, 512); i++) {
			h ^= text.charCodeAt(i);
			h = Math.imul(h, 16777619) >>> 0;
		}
		return h.toString(16).padStart(8, '0');
	}

	const entry = {
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
		userId:        Number(locals.user.id),
	};

	// Insert and return the generated ID so callers (e.g. ResearchTaskStore) can
	// link directly to the summary row without a follow-up lookup.
	const [inserted] = await db
		.insert(researchSummaries)
		.values(entry)
		.onConflictDoNothing()
		.returning({ id: researchSummaries.id })
		.catch(() => [] as { id: string }[]);

	// Non-blocking: embed + enrich in background (won't stall the response)
	if (inserted?.id) {
		persistResearchSummary(entry).catch(() => {});
	}

	return json({ saved: true, id: inserted?.id ?? null });
};
