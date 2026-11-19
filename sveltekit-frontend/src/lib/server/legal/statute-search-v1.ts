/**
 * Statute / legal-chunk retrieval over PostgreSQL (canonical truth): `legal_chunks` (768-d pgvector HNSW + tsv)
 * joined to `legal_nodes` (citation) and, optionally, `library_documents` (corpus type).
 *
 * Single owner for this SQL: used by POST /api/statutes/search and the TRACE `legal.search_statutes` tool.
 * Read-only: every statement here is a SELECT/WITH. No Qdrant, no writes.
 *
 * Source typing (REC-16): the corpus is California statutory text (library_documents.corpus_type in
 * {statute, treatise}). Nothing here may be presented as a judicial opinion; opinion tools must return
 * `opinionCorpusLimitation()` when no verified opinion corpus exists.
 */

/** Embedding recipe of the stored `legal_chunks.embedding` vectors, measured 2026-10-29 (REC-15). */
export const STATUTE_EMBEDDING_RECIPE_V1 = Object.freeze({
	schema: 'atlas.legal-chunk-embedding-recipe.v1',
	model: 'embeddinggemma:latest',
	modelDigestPrefix: '82f094e4c0e19bc4', // Ollama /api/tags digest observed 2026-10-29; re-pin if the model is re-pulled
	dimensions: 768,
	queryInput: 'raw query text, no task prefix',
	documentInput: 'raw chunk_text (citation_label + newline + body), no task prefix',
	metric: 'cosine',
	pgOperator: '<=>',
	evidence: 'REC-15: 20/20 sampled chunks re-embed to cosine 1.0000 vs stored vectors',
	compatibleTwins: ['embeddinggemma-cpu:latest'],
	incompatible: ['embeddinggemma2:q8_0'], // mean cosine -0.03 vs stored vectors: a different vector space
});

/** pgvector HNSW returns at most hnsw.ef_search (default 40) candidates unless iterative scan is enabled. */
export const MAX_VECTOR_RESULTS = 40;

/** Case-scoped lexical discovery. Passage text is resolved by the library citation verifier. */
export async function searchCaseLinkedAuthorityChunksV1(
	db: StatuteQueryable, input: { caseId: string; actorId: number; jurisdiction: string; question: string },
): Promise<Array<{ chunkId: string; score: number }>> {
	const { rows } = await db.query(
		`WITH q AS (SELECT websearch_to_tsquery('english', $1) AS tsq)
		SELECT lc.id::text AS chunk_id, ts_rank_cd(lc.tsv, q.tsq, 32) AS score
		FROM legal_chunks lc
		JOIN legal_nodes ln ON ln.id = lc.legal_node_id
		JOIN library_documents ld ON ld.id = ln.document_id
		JOIN library_document_versions ldv
		  ON ldv.id = ln.version_id AND ldv.document_id = ld.id
		 AND ldv.source_hash = ld.source_hash AND ldv.is_current IS TRUE
		JOIN jurisdictions j ON j.id = ld.jurisdiction_id
		CROSS JOIN q
		WHERE lc.tsv @@ q.tsq AND j.code = $2 AND ld.is_official IS TRUE
		  AND ld.corpus_type IN ('statute', 'case', 'constitution', 'regulation')
		  AND lc.parser_revision IS NOT NULL AND lc.char_offset_unit = 'utf16_code_units'
		  AND ld.source_hash ~ '^[a-fA-F0-9]{64}$'
		  AND (ld.uploaded_by IS NULL OR ld.uploaded_by = $3::integer)
		  AND EXISTS (SELECT 1 FROM case_library_links cl WHERE cl.document_id = ld.id AND cl.case_id = $4::uuid
			AND (cl.node_id IS NULL OR cl.node_id = ln.id))
		ORDER BY score DESC, lc.id
		LIMIT 24`,
		[toOrWebSearchQuery(input.question), input.jurisdiction, input.actorId, input.caseId],
	);
	return rows.map((row) => ({ chunkId: String(row.chunk_id), score: Number(row.score) }));
}

export async function listCaseAuthorityJurisdictionsV1(db: StatuteQueryable, caseId: string, actorId: number) {
	const { rows } = await db.query(
		`SELECT DISTINCT j.code, j.name
		FROM case_library_links cl
		JOIN library_documents ld ON ld.id = cl.document_id
		JOIN jurisdictions j ON j.id = ld.jurisdiction_id
		WHERE cl.case_id = $1::uuid AND ld.is_official IS TRUE
		  AND ld.corpus_type IN ('statute', 'case', 'constitution', 'regulation')
		  AND (ld.uploaded_by IS NULL OR ld.uploaded_by = $2::integer)
		ORDER BY j.code LIMIT 100`, [caseId, actorId],
	);
	return rows.map((row) => ({ code: String(row.code), name: String(row.name) }));
}

export type CorpusSourceType = 'statute' | 'treatise' | 'unregistered' | 'unknown';
export type LegalSourceType = CorpusSourceType | 'case' | 'judicial_opinion';

export function classifyCorpusType(corpusType: string | null | undefined): CorpusSourceType {
	if (corpusType == null || corpusType === '') return 'unregistered';
	if (corpusType === 'statute') return 'statute';
	if (corpusType === 'treatise') return 'treatise';
	return 'unknown';
}

export type EmbeddingCheck = { ok: true; vector: number[] } | { ok: false; reason: 'NOT_AN_ARRAY' | 'WRONG_DIMENSIONS' | 'NON_FINITE' | 'ZERO_NORM'; got?: number };

/** Reject vectors that cannot be in the stored 768-d space (wrong size, NaN, zero). Does not prove the model. */
export function validateQueryEmbedding(v: unknown): EmbeddingCheck {
	if (!Array.isArray(v)) return { ok: false, reason: 'NOT_AN_ARRAY' };
	if (v.length !== STATUTE_EMBEDDING_RECIPE_V1.dimensions) return { ok: false, reason: 'WRONG_DIMENSIONS', got: v.length };
	let norm = 0;
	for (const x of v) {
		if (typeof x !== 'number' || !Number.isFinite(x)) return { ok: false, reason: 'NON_FINITE' };
		norm += x * x;
	}
	if (norm === 0) return { ok: false, reason: 'ZERO_NORM' };
	return { ok: true, vector: v as number[] };
}

/** "a or b or c" for websearch_to_tsquery: OR semantics instead of plainto_tsquery's AND of every word. */
export function toOrWebSearchQuery(text: string, maxTerms = 12): string {
	const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'are', 'was', 'were', 'has', 'have', 'not']);
	const seen = new Set<string>();
	for (const m of text.toLowerCase().matchAll(/[a-z0-9]{3,}/g)) {
		if (!stop.has(m[0])) seen.add(m[0]);
		if (seen.size >= maxTerms) break;
	}
	return [...seen].join(' or ');
}

export interface StatuteHit {
	sourceType: CorpusSourceType;
	chunkId: string;
	nodeId: string;
	documentId: string | null;
	documentTitle: string | null;
	heading: string | null;
	citationLabel: string | null;
	jurisdiction: string | null;
	sourceConfidence: string | null;
	chunkIndex: number;
	snippet: string;
	score: number;
	scoreKind: 'cosine' | 'ts_rank';
}

export interface StatuteQueryable {
	query(text: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

const JOIN_COLUMNS = `ln.id AS node_id, ln.document_id AS doc_id, ln.heading AS node_heading, ln.citation_label AS citation,
       ld.title AS doc_title, ld.corpus_type AS corpus_type, ld.source_confidence AS source_confidence, j.code AS jurisdiction`;
// LEFT JOIN library_documents: 9,628 chunks (Cal. Penal Code) have no library_documents row and an INNER JOIN hid them all.
const JOINS = `JOIN legal_nodes ln ON ln.id = top.legal_node_id
       LEFT JOIN library_documents ld ON ld.id = ln.document_id
       LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id`;

export const STATUTE_VECTOR_SQL = `WITH top AS (
  SELECT lc.id, lc.legal_node_id, lc.chunk_index, lc.chunk_text, 1 - (lc.embedding <=> $1::vector) AS similarity
  FROM legal_chunks lc WHERE lc.embedding IS NOT NULL
  ORDER BY lc.embedding <=> $1::vector LIMIT $2)
SELECT top.id AS chunk_id, top.chunk_index, top.chunk_text AS content, top.similarity, ${JOIN_COLUMNS}
FROM top ${JOINS} ORDER BY top.similarity DESC`;

export const STATUTE_TEXT_SQL = `WITH q AS (SELECT websearch_to_tsquery('english', $1) AS tsq),
top AS (
  SELECT lc.id, lc.legal_node_id, lc.chunk_index, lc.chunk_text, ts_rank(lc.tsv, q.tsq) AS similarity
  FROM legal_chunks lc, q WHERE lc.tsv @@ q.tsq
  ORDER BY similarity DESC LIMIT $2)
SELECT top.id AS chunk_id, top.chunk_index, top.chunk_text AS content, top.similarity, ${JOIN_COLUMNS}
FROM top ${JOINS} ORDER BY top.similarity DESC`;

function toHit(r: Record<string, unknown>, scoreKind: StatuteHit['scoreKind']): StatuteHit {
	const s = (x: unknown) => (x == null ? null : String(x));
	return {
		sourceType: classifyCorpusType(s(r.corpus_type)),
		chunkId: String(r.chunk_id),
		nodeId: String(r.node_id),
		documentId: s(r.doc_id),
		documentTitle: s(r.doc_title),
		heading: s(r.node_heading),
		citationLabel: s(r.citation),
		jurisdiction: s(r.jurisdiction),
		sourceConfidence: s(r.source_confidence),
		chunkIndex: Number(r.chunk_index),
		snippet: String(r.content ?? ''),
		score: Number(r.similarity ?? 0),
		scoreKind,
	};
}

export type StatuteSearchResult =
	| { status: 'OK'; mode: 'vector' | 'text'; hits: StatuteHit[]; recipe: typeof STATUTE_EMBEDDING_RECIPE_V1 }
	| { status: 'EMBEDDING_INCOMPATIBLE'; reason: string; hits: [] };

export async function searchStatuteChunks(db: StatuteQueryable, embedding: unknown, limit: number): Promise<StatuteSearchResult> {
	const check = validateQueryEmbedding(embedding);
	if (check.ok === false) return { status: 'EMBEDDING_INCOMPATIBLE', reason: check.reason, hits: [] };
	const bounded = Math.max(1, Math.min(MAX_VECTOR_RESULTS, Math.trunc(limit)));
	const res = await db.query(STATUTE_VECTOR_SQL, [`[${check.vector.join(',')}]`, bounded]);
	return { status: 'OK', mode: 'vector', hits: res.rows.map((r) => toHit(r, 'cosine')), recipe: STATUTE_EMBEDDING_RECIPE_V1 };
}

export async function searchStatuteChunksText(db: StatuteQueryable, text: string, limit: number): Promise<StatuteSearchResult> {
	const q = toOrWebSearchQuery(text);
	if (!q) return { status: 'OK', mode: 'text', hits: [], recipe: STATUTE_EMBEDDING_RECIPE_V1 };
	const bounded = Math.max(1, Math.min(100, Math.trunc(limit)));
	const res = await db.query(STATUTE_TEXT_SQL, [q, bounded]);
	return { status: 'OK', mode: 'text', hits: res.rows.map((r) => toHit(r, 'ts_rank')), recipe: STATUTE_EMBEDDING_RECIPE_V1 };
}

/** Typed response for opinion tools when no verified judicial-opinion corpus exists. Never substitute statutes. */
export function opinionCorpusLimitation() {
	return {
		sourceType: 'judicial_opinion' as const,
		status: 'NO_VERIFIED_OPINION_CORPUS' as const,
		opinions: [] as unknown[],
		count: 0,
		limitation:
			'No admitted judicial-opinion corpus: legal_precedents is empty and the Qdrant legal_documents collection holds a handful of non-opinion points. California code sections are statutes, not opinions.',
		alternativeTool: 'legal.search_statutes',
	};
}
