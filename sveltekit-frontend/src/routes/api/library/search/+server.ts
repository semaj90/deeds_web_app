/**
 * GET /api/library/search
 *
 * Hybrid search over legal library tables.
 * Fast-path: Go search service at GO_SEARCH_URL (4-way parallel fan-out).
 * Fallback:  Inline SQL (lexical + semantic, same as before).
 *
 * Query params: q, jurisdiction?, corpusType?, limit?
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';

const librarySearchSchema = z.object({
	q: z.string().min(2).max(1000),
	jurisdiction: z.string().max(50).nullish(),
	corpusType: z.string().max(50).nullish(),
	limit: z.coerce.number().int().min(1).max(50).default(20),
});

const GO_SEARCH_URL = (ENV as unknown as Record<string, string>).GO_SEARCH_URL || '';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = librarySearchSchema.safeParse({
		q: url.searchParams.get('q')?.trim() ?? '',
		jurisdiction: url.searchParams.get('jurisdiction'),
		corpusType: url.searchParams.get('corpusType'),
		limit: url.searchParams.get('limit') ?? undefined,
	});
	if (!parsed.success) return json({ hits: [], total: 0 });

	const { q, jurisdiction, corpusType, limit } = parsed.data;

	// Fast-path: Go search service (parallel fan-out: citation + FTS + pgvector + Qdrant)
	if (GO_SEARCH_URL) {
		try {
			const goResp = await fetch(`${GO_SEARCH_URL}/search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: q,
					jurisdiction: jurisdiction ?? '',
					corpusType: corpusType ?? '',
					limit,
					userId: locals.user.id,
				}),
				signal: AbortSignal.timeout(8000),
			});
			if (goResp.ok) {
				const data = await goResp.json();
				return json({
					hits: (data.hits ?? []).map(formatGoHit),
					total: data.total ?? 0,
					meta: { ...data.meta, source: 'go-search-service' },
				});
			}
			// Non-200 → fall through to inline SQL
		} catch {
			// Go service unavailable → fall through
		}
	}

	// Fallback: inline SQL (existing logic)
	let queryEmbedding: number[] | null = null;
	try {
		queryEmbedding = await generateSingleEmbedding(q.slice(0, 512));
	} catch {
		// Lexical-only fallback
	}

	const filters: string[] = [];
	const params: unknown[] = [q];
	let paramIdx = 2;

	if (jurisdiction) {
		params.push(jurisdiction);
		filters.push(`j.code = $${paramIdx++}`);
	}
	if (corpusType) {
		params.push(corpusType);
		filters.push(`ld.corpus_type = $${paramIdx++}::corpus_type`);
	}

	const whereClause = filters.length ? `AND ${filters.join(' AND ')}` : '';

	if (queryEmbedding) {
		// Hybrid: lexical rank + cosine, fused with RRF
		params.push(`[${queryEmbedding.join(',')}]`);
		const embeddingParam = paramIdx++;
		params.push(limit * 2); // Fetch more for reranking
		const fetchParam = paramIdx++;

		const hybridQuery = `
			WITH lexical AS (
			  SELECT lc.id AS chunk_id, ln.id AS node_id, ln.document_id,
			         ld.title, ld.corpus_type, ld.source_type, ld.is_official, ld.official_url,
			         ln.heading, ln.citation_label, ln.node_path, ln.node_type,
			         lc.page_start, lc.page_end,
			         ts_rank(ln.tsv, plainto_tsquery('english', $1)) AS lex_score,
			         lc.chunk_text AS snippet,
			         j.code AS jcode, j.name AS jname
			  FROM legal_chunks lc
			  JOIN legal_nodes ln ON ln.id = lc.legal_node_id
			  JOIN library_documents ld ON ld.id = ln.document_id
			  LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
			  WHERE ln.tsv @@ plainto_tsquery('english', $1)
			  ${whereClause}
			  ORDER BY lex_score DESC LIMIT $${fetchParam}
			),
			semantic AS (
			  SELECT lc.id AS chunk_id, ln.id AS node_id, ln.document_id,
			         ld.title, ld.corpus_type, ld.source_type, ld.is_official, ld.official_url,
			         ln.heading, ln.citation_label, ln.node_path, ln.node_type,
			         lc.page_start, lc.page_end,
			         1 - (lc.embedding <=> $${embeddingParam}::vector) AS sem_score,
			         lc.chunk_text AS snippet,
			         j.code AS jcode, j.name AS jname
			  FROM legal_chunks lc
			  JOIN legal_nodes ln ON ln.id = lc.legal_node_id
			  JOIN library_documents ld ON ld.id = ln.document_id
			  LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
			  WHERE lc.embedding IS NOT NULL
			  ${whereClause}
			  ORDER BY lc.embedding <=> $${embeddingParam}::vector LIMIT $${fetchParam}
			),
			combined AS (
			  SELECT coalesce(l.chunk_id, s.chunk_id) AS chunk_id,
			         coalesce(l.node_id, s.node_id) AS node_id,
			         coalesce(l.document_id, s.document_id) AS document_id,
			         coalesce(l.title, s.title) AS title,
			         coalesce(l.citation_label, s.citation_label) AS citation_label,
			         coalesce(l.heading, s.heading) AS heading,
			         coalesce(l.node_path, s.node_path) AS node_path,
			         coalesce(l.node_type, s.node_type) AS node_type,
			         coalesce(l.corpus_type, s.corpus_type) AS corpus_type,
			         coalesce(l.source_type, s.source_type) AS source_type,
			         coalesce(l.is_official, s.is_official) AS is_official,
			         coalesce(l.official_url, s.official_url) AS official_url,
			         coalesce(l.page_start, s.page_start) AS page_start,
			         coalesce(l.page_end, s.page_end) AS page_end,
			         coalesce(l.snippet, s.snippet) AS snippet,
			         coalesce(l.jcode, s.jcode) AS jcode,
			         coalesce(l.jname, s.jname) AS jname,
			         coalesce(l.lex_score, 0) * 0.4 + coalesce(s.sem_score, 0) * 0.6 AS score,
			         CASE
			           WHEN l.chunk_id IS NOT NULL AND s.chunk_id IS NOT NULL THEN 'fused'
			           WHEN s.chunk_id IS NOT NULL THEN 'vector'
			           ELSE 'fts'
			         END AS match_type
			  FROM lexical l
			  FULL OUTER JOIN semantic s USING (chunk_id)
			)
			SELECT * FROM combined ORDER BY score DESC LIMIT $${paramIdx}`;

		params.push(limit);

		const res = await pool.query(hybridQuery, params);
		return json({ hits: res.rows.map(formatHit), total: res.rowCount });
	} else {
		// Lexical only
		params.push(limit);
		const lexQuery = `
			SELECT lc.id AS chunk_id, ln.id AS node_id, ln.document_id,
			       ld.title, ld.corpus_type, ld.source_type, ld.is_official, ld.official_url,
			       ln.heading, ln.citation_label, ln.node_path, ln.node_type,
			       lc.page_start, lc.page_end,
			       ts_rank(ln.tsv, plainto_tsquery('english', $1)) AS score,
			       lc.chunk_text AS snippet,
			       j.code AS jcode, j.name AS jname,
			       'fts' AS match_type
			FROM legal_chunks lc
			JOIN legal_nodes ln ON ln.id = lc.legal_node_id
			JOIN library_documents ld ON ld.id = ln.document_id
			LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
			WHERE ln.tsv @@ plainto_tsquery('english', $1)
			${whereClause}
			ORDER BY score DESC
			LIMIT $${paramIdx}`;

		const res = await pool.query(lexQuery, params);
		return json({ hits: res.rows.map(formatHit), total: res.rowCount, meta: { source: 'inline-sql' } });
	}
};

/** Format a row from the Go search service response */
function formatGoHit(hit: Record<string, unknown>) {
	return {
		chunkId:      hit.chunkId,
		documentId:   hit.documentId,
		nodeId:       hit.nodeId,
		title:        hit.title,
		citation:     hit.citationLabel,
		heading:      hit.heading,
		nodePath:     hit.nodePath,
		nodeType:     hit.nodeType,
		snippet:      hit.snippet,
		score:        Number(hit.score ?? 0),
		sourceType:   hit.sourceType,
		isOfficial:   hit.isOfficial,
		officialUrl:  hit.officialUrl,
		pageStart:    hit.pageStart,
		pageEnd:      hit.pageEnd,
		jurisdiction: { code: hit.jurisdictionCode, name: hit.jurisdictionName },
		corpusType:   hit.corpusType,
		matchType:    hit.matchType,
	};
}

/** Format a row from the inline SQL fallback */
function formatHit(row: Record<string, unknown>) {
	const snippet = (row.snippet as string) ?? '';
	return {
		chunkId:      row.chunk_id,
		documentId:   row.document_id,
		nodeId:       row.node_id,
		title:        row.title,
		citation:     row.citation_label,
		heading:      row.heading,
		nodePath:     row.node_path,
		nodeType:     row.node_type,
		snippet:      snippet.length > 400 ? snippet.slice(0, 400) + '…' : snippet,
		score:        Number(row.score ?? 0),
		sourceType:   row.source_type,
		isOfficial:   row.is_official,
		officialUrl:  row.official_url,
		pageStart:    row.page_start,
		pageEnd:      row.page_end,
		jurisdiction: { code: row.jcode, name: row.jname },
		corpusType:   row.corpus_type,
		matchType:    (row.match_type as string) ?? 'fts',
	};
}
