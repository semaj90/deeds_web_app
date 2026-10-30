import { describe, expect, it, vi } from 'vitest';
import {
	MAX_VECTOR_RESULTS,
	STATUTE_EMBEDDING_RECIPE_V1,
	STATUTE_TEXT_SQL,
	STATUTE_VECTOR_SQL,
	classifyCorpusType,
	opinionCorpusLimitation,
	searchStatuteChunks,
	searchStatuteChunksText,
	toOrWebSearchQuery,
	validateQueryEmbedding,
	type StatuteQueryable,
} from './statute-search-v1';

const vec = (n = 768, fill = 0.1) => Array.from({ length: n }, () => fill);
const row = (o: Record<string, unknown> = {}) => ({
	chunk_id: 'c1', chunk_index: 0, content: 'Cal. Civ. Code § 3395\nWhenever an obligation…', similarity: 0.55,
	node_id: 'n1', doc_id: 'd1', node_heading: 'h', citation: 'Cal. Civ. Code § 3395',
	doc_title: 'Civil Code', corpus_type: 'statute', source_confidence: 'high', jurisdiction: 'CA', ...o,
});
const fakeDb = (rows: Record<string, unknown>[]): StatuteQueryable & { query: ReturnType<typeof vi.fn> } => ({ query: vi.fn(async () => ({ rows })) });

describe('embedding recipe contract (REC-15)', () => {
	it('pins the stored-vector recipe and marks embeddinggemma2 incompatible', () => {
		expect(STATUTE_EMBEDDING_RECIPE_V1.model).toBe('embeddinggemma:latest');
		expect(STATUTE_EMBEDDING_RECIPE_V1.dimensions).toBe(768);
		expect(STATUTE_EMBEDDING_RECIPE_V1.incompatible).toContain('embeddinggemma2:q8_0');
		expect(STATUTE_EMBEDDING_RECIPE_V1.metric).toBe('cosine');
	});
	it('accepts a 768-d finite non-zero vector', () => {
		expect(validateQueryEmbedding(vec()).ok).toBe(true);
	});
	it.each([
		['not an array', 'x', 'NOT_AN_ARRAY'],
		['wrong dimensions (384)', vec(384), 'WRONG_DIMENSIONS'],
		['NaN', [...vec(767), Number.NaN], 'NON_FINITE'],
		['zero vector', vec(768, 0), 'ZERO_NORM'],
	])('rejects %s', (_n, v, reason) => {
		const r = validateQueryEmbedding(v);
		expect(r.ok).toBe(false);
		if (r.ok === false) expect(r.reason).toBe(reason);
	});
});

describe('source typing', () => {
	it('never maps statute-corpus rows to judicial_opinion', () => {
		expect(classifyCorpusType('statute')).toBe('statute');
		expect(classifyCorpusType('treatise')).toBe('treatise');
		expect(classifyCorpusType(null)).toBe('unregistered');
		expect(classifyCorpusType('opinion')).toBe('unknown');
		for (const t of ['statute', 'treatise', null, 'opinion']) expect(classifyCorpusType(t as string | null)).not.toBe('judicial_opinion');
	});
	it('opinion limitation is typed, empty, and points at the statute tool', () => {
		const l = opinionCorpusLimitation();
		expect(l.sourceType).toBe('judicial_opinion');
		expect(l.status).toBe('NO_VERIFIED_OPINION_CORPUS');
		expect(l.opinions).toEqual([]);
		expect(l.count).toBe(0);
		expect(l.alternativeTool).toBe('legal.search_statutes');
	});
});

describe('searchStatuteChunks (vector)', () => {
	it('returns citation-bearing, source-typed hits ordered by the database', async () => {
		const db = fakeDb([row(), row({ chunk_id: 'c2', node_id: 'n2', similarity: 0.5, citation: 'Cal. Civ. Code § 3392' })]);
		const res = await searchStatuteChunks(db, vec(), 5);
		expect(res.status).toBe('OK');
		if (res.status !== 'OK') return;
		expect(res.hits.map((h) => h.chunkId)).toEqual(['c1', 'c2']);
		expect(res.hits[0]).toMatchObject({ sourceType: 'statute', citationLabel: 'Cal. Civ. Code § 3395', nodeId: 'n1', documentId: 'd1', scoreKind: 'cosine' });
	});
	it('keeps chunks whose document is not in library_documents (unregistered, not dropped)', async () => {
		const res = await searchStatuteChunks(fakeDb([row({ doc_id: 'x', doc_title: null, corpus_type: null, source_confidence: null, jurisdiction: null })]), vec(), 3);
		expect(res.status === 'OK' && res.hits[0].sourceType).toBe('unregistered');
		expect(STATUTE_VECTOR_SQL).toMatch(/LEFT JOIN library_documents/);
		expect(STATUTE_VECTOR_SQL.match(/JOIN library_documents/g)?.length).toBe(1);
	});
	it('refuses incompatible embeddings without touching the database', async () => {
		const db = fakeDb([row()]);
		const res = await searchStatuteChunks(db, vec(384), 5);
		expect(res).toMatchObject({ status: 'EMBEDDING_INCOMPATIBLE', reason: 'WRONG_DIMENSIONS', hits: [] });
		expect(db.query).not.toHaveBeenCalled();
	});
	it('bounds the limit to the HNSW candidate window and binds a vector literal', async () => {
		const db = fakeDb([]);
		await searchStatuteChunks(db, vec(), 500);
		const [, params] = db.query.mock.calls[0];
		expect(params[1]).toBe(MAX_VECTOR_RESULTS);
		expect(String(params[0]).startsWith('[') && String(params[0]).endsWith(']')).toBe(true);
	});
	it('returns an empty OK result when nothing matches', async () => {
		const res = await searchStatuteChunks(fakeDb([]), vec(), 5);
		expect(res).toMatchObject({ status: 'OK', hits: [] });
	});
});

describe('searchStatuteChunksText (OR full text)', () => {
	it('builds OR semantics instead of AND of every word', () => {
		expect(toOrWebSearchQuery('specific performance of the real property obligation')).toBe('specific or performance or real or property or obligation');
		expect(toOrWebSearchQuery('a an of')).toBe('');
	});
	it('skips the database when the query has no usable terms', async () => {
		const db = fakeDb([row()]);
		const res = await searchStatuteChunksText(db, 'a of', 5);
		expect(res).toMatchObject({ status: 'OK', mode: 'text', hits: [] });
		expect(db.query).not.toHaveBeenCalled();
	});
	it('labels text hits as ts_rank, not cosine', async () => {
		const res = await searchStatuteChunksText(fakeDb([row({ similarity: 0.07 })]), 'specific performance', 5);
		expect(res.status === 'OK' && res.hits[0].scoreKind).toBe('ts_rank');
	});
});

describe('read-only and MCP serialization', () => {
	it('contains only SELECT/WITH statements and no write keywords', () => {
		for (const sql of [STATUTE_VECTOR_SQL, STATUTE_TEXT_SQL]) {
			expect(sql.trimStart()).toMatch(/^(WITH|SELECT)\b/);
			expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i);
		}
	});
	it('serializes to JSON for an MCP text content block without loss', async () => {
		const res = await searchStatuteChunks(fakeDb([row()]), vec(), 1);
		const parsed = JSON.parse(JSON.stringify({ source: 'postgres_pgvector', ...res }));
		expect(parsed.hits[0].citationLabel).toBe('Cal. Civ. Code § 3395');
		expect(parsed.recipe.dimensions).toBe(768);
	});
});
