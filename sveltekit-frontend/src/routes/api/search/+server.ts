import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { pool } from '$lib/server/db/client';
import {
	cases,
	evidence,
	personsOfInterest,
	citations,
	reports,
	ragMessages,
	ragSessions,
} from '$lib/server/db/schema-postgres.js';
import { ilike, or, desc, sql, eq } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import type { PlatformSearchHit, PlatformSearchTiming } from '$lib/types/search.js';

/**
 * Unified Platform Search — Three-layer architecture:
 *   Layer 0: gRPC fast path (Go search service, binary protocol, lowest latency)
 *   Layer 1: Fan out to domain adapters in parallel via Promise.allSettled()
 *   Layer 2: Normalize to PlatformSearchHit[], merge, return grouped + timing
 *
 * GET /api/search?q=...&type=all|cases|evidence|poi|citations|legal|glossary|reports|messages&limit=10
 */

// ── Timed Adapter Wrapper ─────────────────────────────────────────────────

type AdapterTimings = Record<string, { ms: number; count: number; status: 'ok' | 'error' | 'timeout' }>;

async function timedAdapter(
	name: string,
	timings: AdapterTimings,
	fn: () => Promise<PlatformSearchHit[]>
): Promise<PlatformSearchHit[]> {
	const t0 = performance.now();
	try {
		const results = await fn();
		timings[name] = { ms: Math.round(performance.now() - t0), count: results.length, status: 'ok' };
		return results;
	} catch {
		timings[name] = { ms: Math.round(performance.now() - t0), count: 0, status: 'error' };
		return [];
	}
}

// ── Go Search Hit Mapper ─────────────────────────────────────────────────

/** Map raw Go search hit to PlatformSearchHit */
function mapGoHit(h: Record<string, unknown>): PlatformSearchHit {
	return {
		id: (h.chunkId ?? h.chunk_id ?? h.id ?? '') as string,
		entityType: 'document' as const,
		title: (h.title ?? h.document_title ?? h.heading ?? 'Legal Document') as string,
		snippet: (h.snippet ?? h.chunk_text ?? '') as string,
		score: (h.score ?? h.rrf_score ?? 0) as number,
		matchType: (h.matchType ?? h.match_type ?? 'fused') as PlatformSearchHit['matchType'],
		route: h.nodeId ?? h.node_id
			? `/library/${h.documentId ?? h.document_id}/node/${h.nodeId ?? h.node_id}`
			: `/library/${h.documentId ?? h.document_id ?? ''}`,
		documentId: (h.documentId ?? h.document_id ?? '') as string,
		nodeId: (h.nodeId ?? h.node_id ?? '') as string,
		chunkId: (h.chunkId ?? h.chunk_id ?? '') as string,
		jurisdiction: (h.jurisdictionCode ?? h.jurisdiction ?? '') as string,
		corpusType: (h.corpusType ?? h.corpus_type ?? '') as string,
		sourceConfidence: (h.sourceConfidence ?? '') as string,
	};
}

// ── gRPC Client for Go Search Service (lazy-loaded, singleton) ──────────

let goGrpcClient: any = null;
let goGrpcFailed = false;
let goGrpcRetryAt = 0;

async function tryGoGrpcSearch(q: string, limit: number): Promise<PlatformSearchHit[] | null> {
	const grpcUrl = ENV.GO_SEARCH_GRPC_URL;
	if (!grpcUrl) return null;

	if (goGrpcFailed) {
		if (Date.now() >= goGrpcRetryAt) {
			goGrpcFailed = false;
			goGrpcClient = null;
		} else {
			return null;
		}
	}

	try {
		if (!goGrpcClient) {
			const grpc = await import('@grpc/grpc-js');
			const protoLoader = await import('@grpc/proto-loader');
			const { resolve } = await import('path');
			const protoPath = resolve('proto/active/library_search.proto');
			const packageDef = await protoLoader.load(protoPath, {
				keepCase: true,
				longs: String,
				enums: String,
				defaults: true,
				oneofs: true,
			});
			const proto = grpc.loadPackageDefinition(packageDef) as any;
			const ServiceClass = proto.yorha?.legal?.LibrarySearchService
				?? proto.libsearch?.LibrarySearchService
				?? proto.LibrarySearchService;
			if (!ServiceClass) throw new Error('LibrarySearchService not found in proto');
			goGrpcClient = new ServiceClass(
				grpcUrl,
				grpc.credentials.createInsecure(),
				{
					'grpc.keepalive_time_ms': 10000,
					'grpc.keepalive_timeout_ms': 5000,
					'grpc.max_receive_message_length': 10 * 1024 * 1024,
				}
			);
		}

		return await new Promise<PlatformSearchHit[]>((resolve, reject) => {
			const deadline = new Date(Date.now() + 5000);
			goGrpcClient.SearchLibrary(
				{ query: q, limit, include_snippets: true },
				{ deadline },
				(err: any, response: any) => {
					if (err) return reject(err);
					const hits = (response?.hits ?? response?.results ?? []) as Record<string, unknown>[];
					resolve(hits.map(mapGoHit));
				}
			);
		});
	} catch (err) {
		console.warn('[search] Go gRPC unavailable, falling back to HTTP:', (err as Error).message);
		goGrpcFailed = true;
		goGrpcRetryAt = Date.now() + 30_000;
		return null;
	}
}

// ── Domain Adapters ───────────────────────────────────────────────────────

/** Search the legal library via Go service gRPC (fastest) → HTTP (fast) → SQL fallback */
async function searchLegalLibrary(q: string, limit: number): Promise<PlatformSearchHit[]> {
	const goUrl = (ENV as unknown as Record<string, string>).GO_SEARCH_URL;

	// Tier 1: gRPC fast path (binary protocol, lowest latency)
	const grpcResult = await tryGoGrpcSearch(q, limit);
	if (grpcResult && grpcResult.length > 0) return grpcResult;

	// Tier 2: HTTP fast path (Go search service REST)
	if (goUrl) {
		try {
			const res = await fetch(`${goUrl}/search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: q, limit }),
				signal: AbortSignal.timeout(5000),
			});
			if (res.ok) {
				const data = await res.json();
				return (data.results ?? data.hits ?? []).map(mapGoHit);
			}
		} catch (err) {
			console.warn('[search] Go HTTP unavailable, falling back to SQL:', (err as Error).message);
		}
	}

	// Tier 3: Inline SQL hybrid search (PostgreSQL FTS)
	try {
		const res = await pool.query(
			`SELECT lc.id as chunk_id,
			        lc.chunk_text,
			        ln.heading as node_heading,
			        ln.id as node_id,
			        ln.citation_label,
			        ld.id as document_id,
			        ld.title as document_title,
			        ld.corpus_type,
			        j.code as jurisdiction_code,
			        ts_rank(ln.tsv, plainto_tsquery('english', $1)) as fts_score
			 FROM legal_chunks lc
			 JOIN legal_nodes ln ON ln.id = lc.legal_node_id
			 JOIN library_documents ld ON ld.id = ln.document_id
			 LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
			 WHERE ln.tsv @@ plainto_tsquery('english', $1)
			 ORDER BY fts_score DESC
			 LIMIT $2`,
			[q, limit]
		);

		return res.rows.map((r: Record<string, unknown>) => ({
			id: (r.chunk_id ?? '') as string,
			entityType: 'document' as const,
			title: (r.document_title ?? 'Legal Document') as string,
			snippet: ((r.chunk_text as string) ?? '').slice(0, 250),
			score: (r.fts_score ?? 0) as number,
			matchType: 'fts' as const,
			route: r.node_id
				? `/library/${r.document_id}/node/${r.node_id}`
				: `/library/${r.document_id ?? ''}`,
			documentId: (r.document_id ?? '') as string,
			nodeId: (r.node_id ?? '') as string,
			jurisdiction: (r.jurisdiction_code ?? '') as string,
			corpusType: (r.corpus_type ?? '') as string,
		}));
	} catch {
		return [];
	}
}

/** Search glossary / legal definitions */
async function searchGlossary(q: string, limit: number): Promise<PlatformSearchHit[]> {
	try {
		const res = await pool.query(
			`SELECT ld.id, ld.term, ld.definition_text,
			        ln.id as node_id, ln.document_id
			 FROM legal_definitions ld
			 LEFT JOIN legal_nodes ln ON ln.id = ld.defined_in_node_id
			 WHERE ld.term ILIKE $1 OR ld.definition_text ILIKE $1
			 ORDER BY CASE WHEN ld.term ILIKE $2 THEN 0 ELSE 1 END
			 LIMIT $3`,
			[`%${q}%`, `${q}%`, limit]
		);

		return res.rows.map((r: Record<string, unknown>) => ({
			id: (r.id ?? '') as string,
			entityType: 'glossary' as const,
			title: (r.term ?? '') as string,
			snippet: ((r.definition_text as string) ?? '').slice(0, 250),
			score: 0.7,
			matchType: 'fts' as const,
			route: r.document_id && r.node_id
				? `/library/${r.document_id}/node/${r.node_id}`
				: '/library/glossary',
		}));
	} catch {
		return [];
	}
}

/** Search cases via ILIKE on title/description */
async function searchCases(q: string, limit: number): Promise<PlatformSearchHit[]> {
	const pattern = `%${q}%`;
	const rows = await db
		.select({
			id: cases.id,
			title: cases.title,
			description: cases.description,
			status: cases.status,
			createdAt: cases.createdAt,
		})
		.from(cases)
		.where(or(ilike(cases.title, pattern), ilike(cases.description, pattern)))
		.orderBy(desc(cases.createdAt))
		.limit(limit);

	return rows.map((r) => ({
		id: r.id,
		entityType: 'case' as const,
		title: r.title ?? 'Untitled Case',
		snippet: (r.description ?? '').slice(0, 250),
		score: 0.8,
		matchType: 'ilike' as const,
		route: `/cases/${r.id}`,
		metadata: { status: r.status },
	}));
}

/** Search evidence via ILIKE on title/description */
async function searchEvidence(q: string, limit: number): Promise<PlatformSearchHit[]> {
	const pattern = `%${q}%`;
	const rows = await db
		.select({
			id: evidence.id,
			title: evidence.title,
			description: evidence.description,
			type: evidence.type,
			createdAt: evidence.createdAt,
		})
		.from(evidence)
		.where(or(ilike(evidence.title, pattern), ilike(evidence.description, pattern)))
		.orderBy(desc(evidence.createdAt))
		.limit(limit);

	return rows.map((r) => ({
		id: r.id,
		entityType: 'evidence' as const,
		title: r.title ?? 'Evidence',
		snippet: (r.description ?? '').slice(0, 250),
		score: 0.75,
		matchType: 'ilike' as const,
		route: `/evidence?id=${r.id}`,
		metadata: { type: r.type },
	}));
}

/** Search persons of interest via ILIKE */
async function searchPOI(q: string, limit: number): Promise<PlatformSearchHit[]> {
	const pattern = `%${q}%`;
	const rows = await db
		.select({
			id: personsOfInterest.id,
			name: personsOfInterest.name,
			description: personsOfInterest.description,
			threatLevel: personsOfInterest.threatLevel,
			status: personsOfInterest.status,
		})
		.from(personsOfInterest)
		.where(or(ilike(personsOfInterest.name, pattern), ilike(personsOfInterest.description, pattern)))
		.orderBy(desc(personsOfInterest.createdAt))
		.limit(limit);

	return rows.map((r) => ({
		id: r.id,
		entityType: 'poi' as const,
		title: r.name ?? 'Person',
		snippet: (r.description ?? '').slice(0, 250),
		score: 0.7,
		matchType: 'ilike' as const,
		route: `/persons-of-interest/${r.id}`,
		metadata: { threatLevel: r.threatLevel, status: r.status },
	}));
}

/** Search citations via ILIKE on quoted_text/formatted_citation */
async function searchCitations(q: string, limit: number): Promise<PlatformSearchHit[]> {
	const pattern = `%${q}%`;
	const rows = await db
		.select({
			id: citations.id,
			caseId: citations.caseId,
			pageNumber: citations.pageNumber,
			createdAt: citations.createdAt,
			quotedText: sql<string>`"citations"."quoted_text"`,
			formattedCitation: sql<string>`"citations"."formatted_citation"`,
		})
		.from(citations)
		.where(
			or(
				sql`"citations"."quoted_text" ILIKE ${pattern}`,
				sql`"citations"."formatted_citation" ILIKE ${pattern}`
			)
		)
		.orderBy(desc(citations.createdAt))
		.limit(limit);

	return rows.map((r) => ({
		id: r.id,
		entityType: 'citation' as const,
		title: r.formattedCitation ?? 'Citation',
		snippet: (r.quotedText ?? '').slice(0, 250),
		score: 0.65,
		matchType: 'ilike' as const,
		route: `/citations`,
		caseId: r.caseId ?? undefined,
	}));
}

/** Search reports via ILIKE on title/content */
async function searchReports(q: string, limit: number): Promise<PlatformSearchHit[]> {
	const pattern = `%${q}%`;
	const rows = await db
		.select({
			id: reports.id,
			title: reports.title,
			content: reports.content,
			type: reports.type,
			status: reports.status,
			caseId: reports.caseId,
			createdAt: reports.createdAt,
		})
		.from(reports)
		.where(or(ilike(reports.title, pattern), ilike(reports.content, pattern)))
		.orderBy(desc(reports.createdAt))
		.limit(limit);

	return rows.map((r) => ({
		id: r.id,
		entityType: 'report' as const,
		title: r.title ?? 'Report',
		snippet: (r.content ?? '').slice(0, 250),
		score: 0.7,
		matchType: 'ilike' as const,
		route: `/reports/${r.id}`,
		caseId: r.caseId ?? undefined,
		metadata: { type: r.type, status: r.status },
	}));
}

/** Search chat messages via ILIKE on content, joined with sessions for title */
async function searchMessages(q: string, limit: number): Promise<PlatformSearchHit[]> {
	const pattern = `%${q}%`;
	const rows = await db
		.select({
			id: ragMessages.id,
			content: ragMessages.content,
			role: ragMessages.role,
			createdAt: ragMessages.createdAt,
			sessionId: ragMessages.sessionId,
			sessionTitle: ragSessions.title,
		})
		.from(ragMessages)
		.innerJoin(ragSessions, eq(ragMessages.sessionId, ragSessions.id))
		.where(ilike(ragMessages.content, pattern))
		.orderBy(desc(ragMessages.createdAt))
		.limit(limit);

	return rows.map((r) => ({
		id: r.id,
		entityType: 'message' as const,
		title: r.sessionTitle ?? 'Chat Message',
		snippet: (r.content ?? '').slice(0, 250),
		score: 0.6,
		matchType: 'ilike' as const,
		route: `/terminal?session=${r.sessionId}`,
		metadata: { role: r.role },
	}));
}

// ── Main Handler ──────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const type = url.searchParams.get('type') ?? 'all';
	const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 10)));

	if (!q || q.length < 2) {
		return json({ error: 'Query must be at least 2 characters' }, { status: 400 });
	}

	const startTime = performance.now();
	const adapterTimings: AdapterTimings = {};

	try {
		// Build adapter list based on requested type
		const adapters: Array<{ name: string; fn: () => Promise<PlatformSearchHit[]> }> = [];

		if (type === 'all' || type === 'cases') {
			adapters.push({ name: 'cases', fn: () => searchCases(q, limit) });
		}
		if (type === 'all' || type === 'evidence') {
			adapters.push({ name: 'evidence', fn: () => searchEvidence(q, limit) });
		}
		if (type === 'all' || type === 'poi') {
			adapters.push({ name: 'poi', fn: () => searchPOI(q, limit) });
		}
		if (type === 'all' || type === 'citations') {
			adapters.push({ name: 'citations', fn: () => searchCitations(q, limit) });
		}
		if (type === 'all' || type === 'legal') {
			adapters.push({ name: 'legal', fn: () => searchLegalLibrary(q, limit) });
		}
		if (type === 'all' || type === 'glossary') {
			adapters.push({ name: 'glossary', fn: () => searchGlossary(q, limit) });
		}
		if (type === 'all' || type === 'reports') {
			adapters.push({ name: 'reports', fn: () => searchReports(q, limit) });
		}
		if (type === 'all' || type === 'messages') {
			adapters.push({ name: 'messages', fn: () => searchMessages(q, limit) });
		}

		// Fan out with Promise.allSettled — individual failures don't break the search
		const settled = await Promise.allSettled(
			adapters.map((a) => timedAdapter(a.name, adapterTimings, a.fn))
		);

		// Collect all successful hits
		const hits: PlatformSearchHit[] = [];
		for (const result of settled) {
			if (result.status === 'fulfilled') {
				hits.push(...result.value);
			}
		}

		// Sort all hits by score descending
		hits.sort((a, b) => b.score - a.score);

		// Group counts
		const groups: Record<string, number> = {};
		for (const h of hits) {
			groups[h.entityType] = (groups[h.entityType] ?? 0) + 1;
		}

		const timing: PlatformSearchTiming = {
			totalMs: Math.round(performance.now() - startTime),
			adapters: adapterTimings,
		};

		return json({
			query: q,
			type,
			totalResults: hits.length,
			groups,
			hits,
			timing,
		});
	} catch (err) {
		console.error('[search] error:', err);
		return json({
			query: q,
			type,
			totalResults: 0,
			groups: {},
			hits: [],
			timing: {
				totalMs: Math.round(performance.now() - startTime),
				adapters: adapterTimings,
			},
		});
	}
};
