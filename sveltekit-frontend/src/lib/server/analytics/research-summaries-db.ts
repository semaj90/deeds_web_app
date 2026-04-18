/**
 * research-summaries-db.ts
 *
 * Server-side query and persist layer for the `research_summaries` table.
 *
 * Key features:
 *   - Cursor-based (keyset) pagination — O(1) per page, no OFFSET scan
 *   - "Did You Mean" via pg_trgm trigram similarity (top 100, paginated)
 *   - Redis page-state cache per user+filter fingerprint (30 min TTL)
 *   - Fuse.js search index built from current page for instant client-side
 *     top-3-5 hits (serialized JSON sent with response)
 *   - Async non-blocking persist from crawler pipeline
 */

import { sql, and, eq, desc, or, type SQL } from 'drizzle-orm';
// (lt was removed — keyset cursor uses raw sql<> expressions instead of lt())
import { db } from '$lib/server/db/client';
import { researchSummaries, type NewResearchSummary, type ResearchSummary } from '$lib/server/db/schema-postgres.js';
import { getRedis } from '$lib/server/redis.js';

// ── Embedding helpers (lazy import to avoid circular deps) ────────────────────

async function embedSummaryText(
	text:     string,
	pipeline: string,
): Promise<{ vector: number[]; qdrantTags: string[] }> {
	try {
		const { generateEmbeddingsWithTags } = await import('$lib/server/grpc/embedding-client.js');
		const { result, qdrantTags } = await generateEmbeddingsWithTags([text], pipeline);
		return { vector: result.vectors[0] ?? [], qdrantTags };
	} catch {
		return { vector: [], qdrantTags: [] };
	}
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_STATE_TTL = 30 * 60;         // 30 min — user browsing session
const PAGE_STATE_PFX = 'research:browse:';
const DEFAULT_LIMIT  = 25;
const MAX_LIMIT      = 100;
const DYM_THRESHOLD  = 0.25;            // pg_trgm minimum similarity
const DYM_TOP        = 100;             // max DYM suggestions

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BrowseFilters {
	/** 'all' or comma-joined: web,corpus,document,image,video,report,note,case */
	source:    string;
	pipeline:  string;
	tags:      string[];       // entity_tags containment filter (AND)
	query:     string;         // free text → pg_trgm DYM, not FTS filter
	sortBy:    'relevance' | 'date';
	limit:     number;
	/** Cursor = "{relevance_score}:{id}" or "date:{iso}:{id}" */
	cursor:    string | null;
}

export interface BrowsePage {
	summaries:   ResearchSummary[];
	nextCursor:  string | null;
	prevCursor:  string | null;  // stored in Redis per user
	total:       number;         // estimated via count(*) with filters
	page:        number;         // 1-based, stored in Redis per user
	totalPages:  number;
	didYouMean:  string[];       // top-10 trgm suggestions for current query
	/** Compact Fuse.js-ready index: title + query + entityTags for client-side top-5 */
	fuseIndex:   { id: string; title: string; query: string; tags: string }[];
}

export interface PageState {
	page:        number;
	cursor:      string | null;
	prevCursor:  string | null;
	totalEstimate: number;
}

// ── Redis page-state helpers ───────────────────────────────────────────────────

function filterFingerprint(f: BrowseFilters): string {
	// FNV-1a of the stable filter params (excludes cursor/page)
	const str = `${f.source}|${f.pipeline}|${f.tags.sort().join(',')}|${f.query}|${f.sortBy}|${f.limit}`;
	let h = 2166136261;
	for (let i = 0; i < Math.min(str.length, 512); i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return h.toString(16).padStart(8, '0');
}

export async function loadPageState(userId: string, filters: BrowseFilters): Promise<PageState | null> {
	try {
		const key = `${PAGE_STATE_PFX}${userId}:${filterFingerprint(filters)}`;
		const raw = await getRedis().get(key);
		return raw ? JSON.parse(raw) as PageState : null;
	} catch { return null; }
}

export async function savePageState(userId: string, filters: BrowseFilters, state: PageState): Promise<void> {
	try {
		const key = `${PAGE_STATE_PFX}${userId}:${filterFingerprint(filters)}`;
		await getRedis().set(key, JSON.stringify(state), 'EX', PAGE_STATE_TTL);
	} catch { /* non-fatal */ }
}

// ── Cursor encode/decode ───────────────────────────────────────────────────────

function encodeCursor(row: ResearchSummary, sortBy: 'relevance' | 'date'): string {
	if (sortBy === 'date') return `date:${row.createdAt.toISOString()}:${row.id}`;
	return `${row.relevanceScore}:${row.id}`;
}

function decodeCursor(cursor: string, sortBy: 'relevance' | 'date'): {
	score?: number; date?: string; id: string;
} {
	if (sortBy === 'date') {
		const [, date, id] = cursor.split(':');
		return { date, id };
	}
	const colonIdx = cursor.lastIndexOf(':');
	return { score: parseFloat(cursor.slice(0, colonIdx)), id: cursor.slice(colonIdx + 1) };
}

// ── Build WHERE clause from filters ───────────────────────────────────────────

function buildWhere(filters: BrowseFilters, cursor: string | null): SQL[] {
	const conditions: SQL[] = [];

	// Source / entity type
	if (filters.source && filters.source !== 'all') {
		const sources = filters.source.split(',').map(s => s.trim()).filter(Boolean);
		if (sources.length === 1) {
			conditions.push(eq(researchSummaries.source, sources[0]));
		} else {
			conditions.push(
				or(...sources.map(s => eq(researchSummaries.source, s)))!,
			);
		}
	}

	// Pipeline
	if (filters.pipeline && filters.pipeline !== 'all') {
		conditions.push(eq(researchSummaries.pipeline, filters.pipeline));
	}

	// Tag containment (all specified tags must be present — AND semantics)
	for (const tag of filters.tags) {
		conditions.push(sql`${researchSummaries.entityTags} @> ARRAY[${tag}]::text[]`);
	}

	// Cursor seek (keyset pagination)
	if (cursor) {
		const dec = decodeCursor(cursor, filters.sortBy);
		if (filters.sortBy === 'date' && dec.date) {
			conditions.push(
				sql`(${researchSummaries.createdAt}, ${researchSummaries.id}) < (${dec.date}::timestamptz, ${dec.id}::uuid)`,
			);
		} else if (dec.score !== undefined) {
			conditions.push(
				sql`(${researchSummaries.relevanceScore}, ${researchSummaries.id}) < (${dec.score}::real, ${dec.id}::uuid)`,
			);
		}
	}

	return conditions;
}

// ── DYM — pg_trgm similarity on query field ────────────────────────────────────

export async function getDidYouMean(
	queryText:  string,
	limit:      number = 10,
	offset:     number = 0,
): Promise<string[]> {
	if (!queryText || queryText.length < 3) return [];
	try {
		const rows = await db.execute<{ query: string; sim: number }>(sql`
			SELECT DISTINCT ON (query)
			  query,
			  similarity(query, ${queryText}) AS sim
			FROM  research_summaries
			WHERE similarity(query, ${queryText}) > ${DYM_THRESHOLD}
			ORDER BY query, sim DESC
			LIMIT  ${Math.min(limit, DYM_TOP)}
			OFFSET ${offset}
		`);
		return (rows as unknown as { rows: { query: string }[] }).rows.map(r => r.query);
	} catch { return []; }
}

// ── Count estimate (for totalPages) ───────────────────────────────────────────

async function countRows(filters: BrowseFilters): Promise<number> {
	try {
		const conditions = buildWhere(filters, null);
		const rows = await db.execute<{ n: string }>(sql`
			SELECT COUNT(*)::text AS n
			FROM   research_summaries
			${conditions.length ? sql`WHERE ${and(...conditions)}` : sql``}
		`);
		return parseInt((rows as unknown as { rows: { n: string }[] }).rows[0]?.n ?? '0', 10);
	} catch { return 0; }
}

// ── Main paginated query ───────────────────────────────────────────────────────

export async function browseResearchSummaries(
	filters: BrowseFilters,
	userId:  string,
): Promise<BrowsePage> {
	const limit      = Math.min(Math.max(1, filters.limit || DEFAULT_LIMIT), MAX_LIMIT);
	const cursor     = filters.cursor ?? null;
	const conditions = buildWhere(filters, cursor);
	const whereClause = conditions.length ? and(...conditions) : undefined;

	// Sorted fetch
	let rows: ResearchSummary[];
	if (filters.sortBy === 'date') {
		rows = await db
			.select()
			.from(researchSummaries)
			.where(whereClause)
			.orderBy(desc(researchSummaries.createdAt), desc(researchSummaries.id))
			.limit(limit + 1);           // +1 to detect hasMore
	} else {
		rows = await db
			.select()
			.from(researchSummaries)
			.where(whereClause)
			.orderBy(desc(researchSummaries.relevanceScore), desc(researchSummaries.id))
			.limit(limit + 1);
	}

	const hasMore    = rows.length > limit;
	const pageRows   = hasMore ? rows.slice(0, limit) : rows;
	const nextCursor = hasMore ? encodeCursor(pageRows[pageRows.length - 1], filters.sortBy) : null;

	// Load/update page state in Redis
	let state = await loadPageState(userId, filters);
	const page = state?.page ?? 1;
	const prevCursor = state?.prevCursor ?? null;

	// Total count (cached in page state to avoid repeated COUNT(*))
	const total = state?.totalEstimate ?? (await countRows(filters));
	const totalPages = Math.max(1, Math.ceil(total / limit));

	// Save updated state
	const newState: PageState = {
		page,
		cursor:       nextCursor,
		prevCursor:   cursor,
		totalEstimate: total,
	};
	await savePageState(userId, filters, newState);

	// DYM
	const didYouMean = filters.query
		? await getDidYouMean(filters.query, 10)
		: [];

	// Fuse.js index payload (compact, client-side)
	const fuseIndex = pageRows.map(r => ({
		id:    r.id,
		title: r.title ?? r.query.slice(0, 80),
		query: r.query,
		tags:  r.entityTags.join(' '),
	}));

	return {
		summaries:  pageRows,
		nextCursor,
		prevCursor,
		total,
		page,
		totalPages,
		didYouMean,
		fuseIndex,
	};
}

// ── Persist a single summary (with embedding + qdrantTag enrichment) ──────────

export async function persistResearchSummary(
	entry: NewResearchSummary,
): Promise<void> {
	try {
		// Embed the summary text so the HNSW index and Bifrost cache key are useful.
		// qdrantTags from nearest-neighbor lookup are merged into entity_tags.
		const { vector, qdrantTags } = await embedSummaryText(
			entry.summary,
			entry.pipeline ?? 'ace',
		);

		const enriched: NewResearchSummary = {
			...entry,
			embedding:  vector.length ? vector : undefined,
			entityTags: [...new Set([...(entry.entityTags ?? []), ...qdrantTags])],
		};

		await db
			.insert(researchSummaries)
			.values(enriched)
			.onConflictDoNothing();   // idempotent — duplicates silently ignored
	} catch { /* non-fatal */ }
}

/**
 * Batch upsert — used by crawlers after a full batch run.
 * Embeds each entry's summary text in a single batched call to minimise
 * round-trips, then merges qdrantTags into entity_tags before insert.
 */
export async function persistResearchSummaryBatch(
	entries: NewResearchSummary[],
): Promise<number> {
	if (!entries.length) return 0;
	try {
		// Batch-embed all summaries in one gRPC/HTTP call
		let vectors: number[][] = [];
		let qdrantTags: string[] = [];
		try {
			const { generateEmbeddingsWithTags } = await import('$lib/server/grpc/embedding-client.js');
			const texts = entries.map(e => e.summary);
			const { result, qdrantTags: tags } = await generateEmbeddingsWithTags(
				texts,
				entries[0]?.pipeline ?? 'ace',
			);
			vectors    = result.vectors;
			qdrantTags = tags;
		} catch { /* fall through — insert without vectors */ }

		const enriched: NewResearchSummary[] = entries.map((e, i) => ({
			...e,
			embedding:  vectors[i]?.length ? vectors[i] : undefined,
			entityTags: [...new Set([...(e.entityTags ?? []), ...qdrantTags])],
		}));

		const result = await db
			.insert(researchSummaries)
			.values(enriched)
			.onConflictDoNothing()
			.returning({ id: researchSummaries.id });
		return result.length;
	} catch { return 0; }
}

// ── Distinct tag list for filter bar autocomplete ─────────────────────────────

export async function getTopEntityTags(limit = 50): Promise<string[]> {
	try {
		const rows = await db.execute<{ tag: string; n: number }>(sql`
			SELECT unnest(entity_tags) AS tag, COUNT(*) AS n
			FROM   research_summaries
			GROUP  BY tag
			ORDER  BY n DESC
			LIMIT  ${limit}
		`);
		return (rows as unknown as { rows: { tag: string }[] }).rows.map(r => r.tag);
	} catch { return []; }
}

// ── Paginated DYM endpoint (top 100, any page) ─────────────────────────────────

export async function getDidYouMeanPage(
	queryText: string,
	page:      number = 1,
	pageSize:  number = 25,
): Promise<{ suggestions: string[]; total: number; page: number; totalPages: number }> {
	const safeSize = Math.min(Math.max(1, pageSize), 100);
	const offset   = (Math.max(1, page) - 1) * safeSize;

	const [suggestions, totalRows] = await Promise.all([
		getDidYouMean(queryText, safeSize, offset),
		(async () => {
			try {
				const rows = await db.execute<{ n: string }>(sql`
					SELECT COUNT(DISTINCT query)::text AS n
					FROM   research_summaries
					WHERE  similarity(query, ${queryText}) > ${DYM_THRESHOLD}
				`);
				return parseInt((rows as unknown as { rows: { n: string }[] }).rows[0]?.n ?? '0', 10);
			} catch { return 0; }
		})(),
	]);

	return {
		suggestions,
		total:      Math.min(totalRows, DYM_TOP),
		page:       Math.max(1, page),
		totalPages: Math.max(1, Math.ceil(Math.min(totalRows, DYM_TOP) / safeSize)),
	};
}