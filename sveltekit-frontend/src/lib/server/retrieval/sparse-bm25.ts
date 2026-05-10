/**
 * Sparse (BM25-style) lexical search over `legal_documents.content_tsv`.
 *
 * Postgres `ts_rank_cd` (cover density) is the closest built-in to BM25 — it
 * weights hits by term frequency and proximity, normalised by document length.
 * For our scale (up to ~1M docs) this is faster than an external Lucene index.
 *
 * Pairs with rrf-fuse.ts: dense Qdrant hits + this lane → fused result.
 *
 * Migration: drizzle/manual/20260510_legal_documents_tsvector.sql adds the
 * generated tsvector column + GIN index this query depends on.
 */

import type { Pool } from 'pg';
import type { RrfHit } from './rrf-fuse.js';

export interface SparseSearchHit extends RrfHit {
	id:    string;
	score: number;
	payload: {
		title:        string | null;
		snippet:      string;
		jurisdiction: string | null;
	};
}

export interface SparseSearchOptions {
	/** Max hits to return — default 30. */
	limit?: number;
	/** Optional jurisdiction filter (e.g. 'CA', 'US-9th'). */
	jurisdiction?: string;
	/** Highlight start/end markers for ts_headline snippet (default `<b>`/`</b>`). */
	highlightTags?: { start: string; end: string };
}

/**
 * Run a BM25-style query against legal_documents.
 *
 * Uses `plainto_tsquery` (forgiving — strips operators) for end-user input.
 * For advanced query syntax (`& | !`), call `to_tsquery` paths separately.
 *
 * @param pool   pg.Pool from $lib/server/db/client
 * @param query  Natural language query text
 * @returns      Hits ranked by ts_rank_cd, descending
 *
 * @example
 *   const hits = await sparseLegalSearch(pool, 'hearsay objection 803');
 *   // hits[0] = {id, score: 0.32, payload: { title, snippet, jurisdiction }}
 */
export async function sparseLegalSearch(
	pool: Pool,
	query: string,
	options: SparseSearchOptions = {}
): Promise<SparseSearchHit[]> {
	const limit = Math.max(1, Math.min(options.limit ?? 30, 200));
	const trimmed = query.trim();
	if (trimmed.length === 0) return [];

	const tags = options.highlightTags ?? { start: '<b>', end: '</b>' };
	const headlineConfig = `MaxWords=24, MinWords=12, ShortWord=3, MaxFragments=2, ` +
		`StartSel="${tags.start}", StopSel="${tags.end}"`;

	const params: unknown[] = [trimmed];
	let jurisdictionFilter = '';
	if (options.jurisdiction) {
		params.push(options.jurisdiction);
		jurisdictionFilter = `AND ld.jurisdiction = $${params.length}`;
	}
	params.push(limit);

	// content_tsv is a GENERATED ALWAYS column — index hit, no per-row tsvector cost.
	// COALESCE on snippet so empty content doesn't blow up ts_headline.
	const sql = `
		WITH q AS (SELECT plainto_tsquery('english', $1) AS query)
		SELECT
			ld.id,
			ld.title,
			ld.jurisdiction,
			ts_rank_cd(ld.content_tsv, q.query)                       AS score,
			ts_headline('english', COALESCE(ld.content, ''), q.query,
				'${headlineConfig}'
			)                                                          AS snippet
		FROM legal_documents ld, q
		WHERE ld.content_tsv @@ q.query
		  ${jurisdictionFilter}
		ORDER BY score DESC
		LIMIT $${params.length}
	`;

	const result = await pool.query<{
		id: string;
		title: string | null;
		jurisdiction: string | null;
		score: number;
		snippet: string;
	}>(sql, params);

	return result.rows.map((row) => ({
		id: row.id,
		score: row.score,
		payload: {
			title:        row.title,
			snippet:      row.snippet,
			jurisdiction: row.jurisdiction,
		},
	}));
}
