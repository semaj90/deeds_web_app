import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { pool } from '$lib/server/db/client';
import { cases, evidence, personsOfInterest, citations } from '$lib/server/db/schema-postgres.js';
import { ilike, or, desc, sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';

/**
 * Unified Platform Search — Two-layer architecture:
 *   Layer 1: Fan out to domain adapters in parallel
 *   Layer 2: Normalize to PlatformSearchHit[], merge, return grouped
 *
 * GET /api/search?q=...&type=all|cases|evidence|poi|citations|legal|glossary&limit=10
 */

interface PlatformSearchHit {
	id: string;
	entityType: 'case' | 'evidence' | 'poi' | 'citation' | 'document' | 'glossary' | 'statute';
	title: string;
	snippet: string;
	score: number;
	matchType: 'fts' | 'vector' | 'fused' | 'ilike';
	route: string;
	documentId?: string;
	nodeId?: string;
	jurisdiction?: string;
	corpusType?: string;
}

/** Search the legal library via Go service (fast path) or inline SQL fallback */
async function searchLegalLibrary(q: string, limit: number): Promise<PlatformSearchHit[]> {
	const goUrl = (ENV as unknown as Record<string, string>).GO_SEARCH_URL;

	// Fast path: Go search service (hybrid: citation + FTS + pgvector + Qdrant)
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
				return (data.results ?? data.hits ?? []).map((h: Record<string, unknown>) => ({
					id: h.chunk_id ?? h.id ?? '',
					entityType: 'document' as const,
					title: (h.document_title ?? h.heading ?? 'Legal Document') as string,
					snippet: (h.snippet ?? h.chunk_text ?? '') as string,
					score: (h.score ?? h.rrf_score ?? 0) as number,
					matchType: (h.match_type ?? 'fused') as 'fts' | 'vector' | 'fused',
					route: h.node_id
						? `/library/${h.document_id}/node/${h.node_id}`
						: `/library/${h.document_id ?? ''}`,
					documentId: (h.document_id ?? '') as string,
					nodeId: (h.node_id ?? '') as string,
					jurisdiction: (h.jurisdiction ?? '') as string,
					corpusType: (h.corpus_type ?? '') as string,
				}));
			}
		} catch {
			// Go service unavailable — fall through to SQL
		}
	}

	// Fallback: Inline SQL hybrid search
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

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const type = url.searchParams.get('type') ?? 'all';
	const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 10)));

	if (!q || q.length < 2) {
		return json({ error: 'Query must be at least 2 characters' }, { status: 400 });
	}

	const pattern = `%${q}%`;
	const results: Record<string, unknown[]> = {};
	const hits: PlatformSearchHit[] = [];

	try {
		const searches: Promise<void>[] = [];

		// ── Domain: Cases ──
		if (type === 'all' || type === 'cases') {
			searches.push(
				db
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
					.limit(limit)
					.then((rows) => {
						results.cases = rows;
						for (const r of rows) {
							hits.push({
								id: r.id,
								entityType: 'case',
								title: r.title ?? 'Untitled Case',
								snippet: (r.description ?? '').slice(0, 250),
								score: 0.8,
								matchType: 'ilike',
								route: `/cases/${r.id}`,
							});
						}
					})
			);
		}

		// ── Domain: Evidence ──
		if (type === 'all' || type === 'evidence') {
			searches.push(
				db
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
					.limit(limit)
					.then((rows) => {
						results.evidence = rows;
						for (const r of rows) {
							hits.push({
								id: r.id,
								entityType: 'evidence',
								title: r.title ?? 'Evidence',
								snippet: (r.description ?? '').slice(0, 250),
								score: 0.75,
								matchType: 'ilike',
								route: `/evidence?id=${r.id}`,
							});
						}
					})
			);
		}

		// ── Domain: POI ──
		if (type === 'all' || type === 'poi') {
			searches.push(
				db
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
					.limit(limit)
					.then((rows) => {
						results.poi = rows;
						for (const r of rows) {
							hits.push({
								id: r.id,
								entityType: 'poi',
								title: r.name ?? 'Person',
								snippet: (r.description ?? '').slice(0, 250),
								score: 0.7,
								matchType: 'ilike',
								route: `/persons-of-interest/${r.id}`,
							});
						}
					})
			);
		}

		// ── Domain: Citations ──
		if (type === 'all' || type === 'citations') {
			searches.push(
				db
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
					.limit(limit)
					.then((rows) => {
						results.citations = rows;
						for (const r of rows) {
							hits.push({
								id: r.id,
								entityType: 'citation',
								title: r.formattedCitation ?? 'Citation',
								snippet: (r.quotedText ?? '').slice(0, 250),
								score: 0.65,
								matchType: 'ilike',
								route: `/citations`,
							});
						}
					})
			);
		}

		// ── Domain: Legal Library (Go service + SQL fallback) ──
		if (type === 'all' || type === 'legal') {
			searches.push(
				searchLegalLibrary(q, limit).then((legalHits) => {
					results.legal = legalHits;
					hits.push(...legalHits);
				})
			);
		}

		// ── Domain: Glossary ──
		if (type === 'all' || type === 'glossary') {
			searches.push(
				searchGlossary(q, limit).then((glossaryHits) => {
					results.glossary = glossaryHits;
					hits.push(...glossaryHits);
				})
			);
		}

		await Promise.all(searches);

		// Sort all hits by score descending
		hits.sort((a, b) => b.score - a.score);

		// Group counts
		const groups: Record<string, number> = {};
		for (const h of hits) {
			groups[h.entityType] = (groups[h.entityType] ?? 0) + 1;
		}

		const totalResults = hits.length;

		return json({
			query: q,
			type,
			totalResults,
			groups,
			hits,
			// Legacy format for backward compatibility
			results,
		});
	} catch (err) {
		console.error('[search] error:', err);
		return json({ query: q, type, totalResults: 0, groups: {}, hits: [], results: {} });
	}
};
