// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	buildDocIntelligenceStudioSnapshotV1, collectLocalCaptures, computeCoverage, findRepoRoot, scanRequiredTerms, searchDocCorpus, searchDocCorpusDense,
	type RuntimeVersions
} from './doc-intelligence-read-model.js';

const RUNTIME: RuntimeVersions = { postgres: '18.4', pgvector: '0.8.3', drizzleOrm: '0.45.2', drizzleKit: '0.31.10', pg: '8.16.0', svelte: '5.46.0', svelteKit: '2.59.1', bitsUi: '2.16.2' };
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

let root: string;

function writeDev(rows: Record<string, unknown>[] = []) {
	const dev = join(root, 'docs', '.okf', 'dev');
	mkdirSync(join(dev, 'raw'), { recursive: true });
	writeFileSync(join(dev, 'manifest.json'), '{}');
	writeFileSync(join(dev, 'index.md'), '# index');
	writeFileSync(join(dev, 'summary.json'), '{}');
	writeFileSync(join(dev, 'corpus.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n'));
}

function writePinned(dir: string, name: string, opts: { url: string; text?: string; fetchedAt?: string; checksum?: string; skipMarkdown?: boolean }) {
	const raw = join(root, 'docs', '.okf', 'pinned', dir, 'raw');
	mkdirSync(raw, { recursive: true });
	const text = opts.text ?? `# ${name}\nhalfvec io_method`;
	writeFileSync(join(raw, `${name}.json`), JSON.stringify({
		source_id: dir, requested_url: opts.url, resolved_url: opts.url, title: name,
		normalized_checksum: opts.checksum ?? sha(text), fetched_at: opts.fetchedAt ?? daysAgo(1)
	}));
	if (!opts.skipMarkdown) writeFileSync(join(raw, `${name}.md`), text);
}

function writeAllGroups() {
	writePinned('drizzle-orm', 'd1', { url: 'https://orm.drizzle.team/docs/extensions' });
	writePinned('pgvector', 'p1', { url: 'https://github.com/pgvector/pgvector' });
	writePinned('postgresql-18', 'q1', { url: 'https://www.postgresql.org/docs/18/release-18.html' });
}

/** Minimal SQL router standing in for pg.Pool; records every statement so tests can assert read-only. */
function fakePool(opts: { chunks?: number; ftsRows?: Record<string, unknown>[]; down?: boolean } = {}) {
	const statements: string[] = [];
	const ftsParams: unknown[][] = [];
	const pool = {
		async query(sql: string, params?: unknown[]) {
			statements.push(sql);
			if (/ts_headline/.test(sql)) ftsParams.push(params ?? []);
			if (opts.down) throw new Error('connection refused');
			const s = sql.replace(/\s+/g, ' ');
			if (/information_schema\.tables/.test(s)) return { rows: [{ table_name: 'atlas_external_doc_pages' }, { table_name: 'atlas_external_doc_chunks' }] };
			if (/FROM pg_attribute a WHERE a\.attrelid IN/.test(s)) return { rows: [
				{ name: 'search_vector', type: 'tsvector' }, { name: 'content_embedding', type: 'vector(768)' }, { name: 'product_version', type: 'text' }] };
			if (/count\(\*\)::int AS n FROM atlas_external_doc_pages/.test(s)) return { rows: [{ n: opts.chunks ? 1 : 0 }] };
			if (/count\(\*\)::int AS n FROM atlas_external_doc_chunks/.test(s)) return { rows: [{ n: opts.chunks ?? 0 }] };
			if (/FROM pg_index x JOIN pg_class i ON i\.oid = x\.indexrelid JOIN pg_class t/.test(s)) return { rows: [
				{ tbl: 'atlas_external_doc_chunks', name: 'aedc_fts_gin', am: 'gin', def: 'CREATE INDEX aedc_fts_gin ON x USING gin (search_vector)', predicate: null }] };
			if (/FROM pg_constraint/.test(s)) return { rows: [{ tbl: 'atlas_external_doc_chunks', conname: 'atlas_external_doc_chunks_evidence_revision_uq', contype: 'u' }] };
			if (/attgenerated/.test(s)) return { rows: [{ n: 1 }] };
			if (/current_setting/.test(s)) return { rows: [{ v: 'worker' }] };
			if (/extname='vector'/.test(s)) return { rows: [{ extversion: '0.8.3' }] };
			if (/relname='pg_aios'/.test(s)) return { rows: [{ n: 1 }] };
			if (/proname='uuidv7'/.test(s)) return { rows: [{ n: 1 }] };
			if (/typname='halfvec'/.test(s)) return { rows: [{ n: 1 }] };
			if (/am\.amname='hnsw'/.test(s)) return { rows: [{ n: 1 }] };
			if (/^EXPLAIN/.test(s)) return { rows: [{ 'QUERY PLAN': [{ Plan: { 'Node Type': 'Bitmap Heap Scan', Plans: [{ 'Node Type': 'Bitmap Index Scan' }] } }] }] };
			if (/ts_headline/.test(s)) return { rows: opts.ftsRows ?? [] };
			return { rows: [] };
		}
	};
	return { pool: pool as unknown as Pool, statements, ftsParams };
}

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'doc-corpus-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('corpus validator', () => {
	it('accepts a valid corpus with current coverage and no issues', () => {
		writeDev(); writeAllGroups();
		const { issues, sources } = collectLocalCaptures(root, RUNTIME);
		expect(issues).toEqual([]);
		expect(computeCoverage(sources).map((c) => c.status)).toEqual(['CAPTURED_CURRENT', 'CAPTURED_CURRENT', 'CAPTURED_CURRENT']);
		const pg = sources.find((s) => s.sourceId === 'postgresql-18');
		expect(pg).toMatchObject({ versionQualification: 'MAJOR_VERSION_PIN', runtimeCompatibility: 'MATCH' });
		expect(sources.find((s) => s.sourceId === 'drizzle-orm')).toMatchObject({ versionQualification: 'CURRENT_UPSTREAM', runtimeCompatibility: 'UNKNOWN' });
	});

	it('does not require the gitignored corpus.jsonl when tracked raw evidence exists (fresh checkout)', () => {
		writeDev(); writeAllGroups();
		writeFileSync(join(root, 'docs', '.okf', 'dev', 'raw', 'page.md'), '# raw');
		rmSync(join(root, 'docs', '.okf', 'dev', 'corpus.jsonl'));
		expect(collectLocalCaptures(root, RUNTIME).issues.map((i) => i.code)).not.toContain('DEV_CORPUS_MISSING');
		rmSync(join(root, 'docs', '.okf', 'dev', 'raw', 'page.md'));
		expect(collectLocalCaptures(root, RUNTIME).issues.map((i) => i.code)).toContain('DEV_CORPUS_MISSING');
	});

	it('flags a missing referenced markdown file', () => {
		writeDev([{ source_id: 's', source_ref: 'r', url: 'u', title: 't', content_hash: 'h', fetched_at: daysAgo(1), markdown_path: join(root, 'nope.md') }]);
		writePinned('pgvector', 'p1', { url: 'https://github.com/pgvector/pgvector', skipMarkdown: true });
		const codes = collectLocalCaptures(root, RUNTIME).issues.map((i) => i.code);
		expect(codes).toContain('DEV_MARKDOWN_MISSING');
		expect(codes).toContain('PINNED_MARKDOWN_MISSING');
	});

	it('marks a source stale after the freshness window', () => {
		writeDev(); writeAllGroups();
		writePinned('pgvector', 'p1', { url: 'https://github.com/pgvector/pgvector', fetchedAt: daysAgo(90) });
		const cov = computeCoverage(collectLocalCaptures(root, RUNTIME).sources);
		expect(cov.find((c) => c.group === 'pgvector')?.status).toBe('CAPTURED_STALE');
	});

	it('detects a checksum mismatch', () => {
		writeDev();
		writePinned('pgvector', 'p1', { url: 'https://github.com/pgvector/pgvector', checksum: 'deadbeef' });
		expect(collectLocalCaptures(root, RUNTIME).issues.map((i) => i.code)).toContain('PINNED_CHECKSUM_MISMATCH');
	});

	it('detects duplicate source_ref and duplicate source+url', () => {
		const row = { source_id: 's', source_ref: 'same', url: 'u', title: 't', content_hash: 'h', fetched_at: daysAgo(1), markdown_path: join(root, 'x.md') };
		writeDev([row, { ...row, url: 'u2' }]);
		writePinned('pgvector', 'a', { url: 'https://github.com/pgvector/pgvector' });
		writePinned('pgvector', 'b', { url: 'https://github.com/pgvector/pgvector' });
		const codes = collectLocalCaptures(root, RUNTIME).issues.map((i) => i.code);
		expect(codes).toContain('DEV_DUPLICATE_SOURCE_REF');
		expect(codes).toContain('PINNED_DUPLICATE_SOURCE_URL');
	});

	it('counts required terms literally and reports token-split hits separately', () => {
		writePinned('pgvector', 'p1', { url: 'https://github.com/pgvector/pgvector', text: 'SET\nhnsw\n.\niterative_scan\n=\nx\nio_method' });
		const byTerm = Object.fromEntries(scanRequiredTerms(root).map((t) => [t.term, t]));
		expect(byTerm['hnsw.iterative_scan']).toMatchObject({ status: 'TOKEN_ONLY_HIT', totalHits: 0, tokenSplitHits: 1 });
		expect(byTerm.io_method).toMatchObject({ status: 'LITERAL_HIT', totalHits: 1 });
		expect(byTerm.uuidv7.status).toBe('MISSING');
	});
});

describe('server read model', () => {
	it('reads an empty Postgres corpus and represents capabilities', async () => {
		writeDev(); writeAllGroups();
		const { pool, statements } = fakePool({ chunks: 0 });
		const snap = await buildDocIntelligenceStudioSnapshotV1({ pool, root });
		expect(snap.canonicalCorpus).toMatchObject({ authority: 'CANONICAL_POSTGRES', status: 'EMPTY', chunkCount: 0 });
		expect(snap.canonicalCorpus.constraints).toContain('atlas_external_doc_chunks.atlas_external_doc_chunks_evidence_revision_uq[u]');
		expect(snap.ftsCapability).toMatchObject({ available: true, searchVectorGenerated: true });
		expect(snap.vectorCapability).toMatchObject({ columnType: 'vector(768)', dimensions: 768, halfvecType: true });
		expect(snap.aioCapability).toMatchObject({ level: 'CAPABILITY', ioMethod: 'worker', pgAiosAvailable: true, productionObserved: 'NOT_OBSERVED' });
		expect(snap.bitmapCapability).toMatchObject({ plannerSelected: true, aioRelevant: true, productionObserved: 'NOT_OBSERVED' });
		expect(snap.validation.issues.map((i) => i.code)).toContain('DOC_CANONICAL_CORPUS_EMPTY');
		expect(snap.localCorpus.authority).toBe('REFERENCE_ONLY');
		expect(snap).toMatchObject({ canonicalAuthority: 'POSTGRES', generatedCorpusAuthority: false });
		expect(statements.every((s) => /^\s*(SELECT|EXPLAIN|SHOW)/i.test(s))).toBe(true);
	});

	it('reports PRESENT when canonical rows exist', async () => {
		writeDev(); writeAllGroups();
		const snap = await buildDocIntelligenceStudioSnapshotV1({ pool: fakePool({ chunks: 5 }).pool, root });
		expect(snap.canonicalCorpus.status).toBe('PRESENT');
	});

	it('falls back to local corpus when Postgres is unavailable', async () => {
		writeDev(); writeAllGroups();
		const snap = await buildDocIntelligenceStudioSnapshotV1({ pool: fakePool({ down: true }).pool, root });
		expect(snap.canonicalCorpus.status).toBe('UNAVAILABLE');
		expect(snap.localCorpus.missingSources).toEqual([]);
		expect(snap.validation.issues.map((i) => i.code)).toContain('POSTGRES_UNAVAILABLE');
	});

	it('fails validation when the local corpus is missing', async () => {
		const snap = await buildDocIntelligenceStudioSnapshotV1({ pool: null, root });
		expect(snap.validation.status).toBe('FAIL');
		expect(snap.localCorpus.missingSources.sort()).toEqual(['drizzle', 'pgvector', 'postgresql18']);
	});
});

describe('search', () => {
	const canonicalRow = (over: Record<string, unknown> = {}) => ({
		chunk_id: 'doc:pgvector:abc:3', chunk_evidence_revision: 'sha256:chunkrev', heading_path: ['Indexing', 'HNSW'], page_id: '11111111-2222-3333-4444-555555555555', title: 'pgvector',
		provider: 'pgvector', product: 'pgvector', product_version: '0.8.3', url: 'https://x', source_authority: 'OFFICIAL', page_evidence_revision: 'sha256:pagerev', excerpt: 'halfvec «index»', ...over
	});

	it('returns canonical FTS hits with an explicit CANONICAL source class and full row provenance', async () => {
		writeDev(); writeAllGroups();
		const { pool } = fakePool({ chunks: 3, ftsRows: [canonicalRow()] });
		const r = await searchDocCorpus({ pool, root, q: 'halfvec' });
		expect(r.mode).toBe('POSTGRES_FTS');
		expect(r.hits[0]).toMatchObject({
			badge: 'CANONICAL_POSTGRES', sourceClass: 'CANONICAL', productVersion: '0.8.3', authorityClass: 'OFFICIAL', provider: 'pgvector', product: 'pgvector', url: 'https://x',
			pageId: '11111111-2222-3333-4444-555555555555', chunkId: 'doc:pgvector:abc:3', chunkEvidenceRevision: 'sha256:chunkrev', revision: 'sha256:pagerev', headingPath: ['Indexing', 'HNSW']
		});
		// chunk grain and page grain must never be conflated
		expect(r.hits[0].chunkEvidenceRevision).not.toBe(r.hits[0].revision);
	});

	it('applies bounded exact-match product/version filters as query parameters', async () => {
		writeDev(); writeAllGroups();
		const f = fakePool({ chunks: 3, ftsRows: [canonicalRow()] });
		const r = await searchDocCorpus({ pool: f.pool, root, q: 'halfvec', limit: 7, product: 'pgvector', productVersion: 'x'.repeat(300) });
		expect(f.ftsParams[0]).toEqual(['halfvec', 7, 'pgvector', 'x'.repeat(100)]);
		expect(r.filters).toEqual({ product: 'pgvector', productVersion: 'x'.repeat(100) });
		const none = fakePool({ chunks: 3, ftsRows: [] });
		await searchDocCorpus({ pool: none.pool, root, q: 'halfvec' });
		expect(none.ftsParams[0]).toEqual(['halfvec', 10, null, null]);
	});

	it('preserves CURRENT_UPSTREAM@ / UNVERSIONED@ qualification exactly (no invented semver)', async () => {
		writeDev(); writeAllGroups();
		const { pool } = fakePool({ chunks: 3, ftsRows: [canonicalRow({ product_version: 'CURRENT_UPSTREAM@2026-09-23' }), canonicalRow({ chunk_id: 'c2', chunk_evidence_revision: 'sha256:r2', product_version: 'UNVERSIONED@2026-09-23' })] });
		const r = await searchDocCorpus({ pool, root, q: 'halfvec' });
		expect(r.hits.map((h) => h.productVersion)).toEqual(['CURRENT_UPSTREAM@2026-09-23', 'UNVERSIONED@2026-09-23']);
	});

	it('canonical zero hits stays canonical: empty result, NO silent reference fallback', async () => {
		writeDev(); writeAllGroups();
		const r = await searchDocCorpus({ pool: fakePool({ chunks: 852, ftsRows: [] }).pool, root, q: 'io_method' });
		expect(r.mode).toBe('POSTGRES_FTS');
		expect(r.hits).toEqual([]);
		expect(r.postgresNote).toBeNull();
	});

	it('database failure falls back visibly: LOCAL_LEXICAL + POSTGRES_UNAVAILABLE note, never a CANONICAL class', async () => {
		writeDev(); writeAllGroups();
		const r = await searchDocCorpus({ pool: fakePool({ down: true }).pool, root, q: 'io_method' });
		expect(r.mode).toBe('LOCAL_LEXICAL');
		expect(r.postgresNote).toMatch(/^POSTGRES_UNAVAILABLE:/);
		expect(r.hits.length).toBeGreaterThan(0);
		for (const h of r.hits) { expect(h.sourceClass).not.toBe('CANONICAL'); expect(h.badge).not.toBe('CANONICAL_POSTGRES'); expect(h.chunkId).toBeNull(); }
	});

	it('the canonical lane only reads (no write statements)', async () => {
		writeDev(); writeAllGroups();
		const f = fakePool({ chunks: 3, ftsRows: [canonicalRow()] });
		await searchDocCorpus({ pool: f.pool, root, q: 'halfvec' });
		for (const sql of f.statements) expect(sql).not.toMatch(/(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)/i);
	});

	it('falls back to local lexical search labelled REFERENCE_ONLY when Postgres is empty', async () => {
		writeDev(); writeAllGroups();
		const r = await searchDocCorpus({ pool: fakePool({ chunks: 0 }).pool, root, q: 'io_method' });
		expect(r.mode).toBe('LOCAL_LEXICAL');
		expect(r.postgresNote).toBe('DOC_CORPUS_POSTGRES_EMPTY');
		expect(r.hits.length).toBeGreaterThan(0);
		expect(new Set(r.hits.map((h) => h.badge))).toEqual(new Set(['REFERENCE_ONLY']));
		expect(new Set(r.hits.map((h) => h.sourceClass))).toEqual(new Set(['REFERENCE_ONLY']));
	});

	it('returns no hits for an unmatched query and never a CANONICAL badge locally', async () => {
		writeDev(); writeAllGroups();
		const r = await searchDocCorpus({ pool: null, root, q: 'zzzz-not-present' });
		expect(r.hits).toEqual([]);
	});

	it('reads the atomically published corpus generation and rejects damaged publication artifacts', () => {
		writeDev(); writeAllGroups();
		const dev = join(root, 'docs', '.okf', 'dev');
		const generationDir = join(dev, '.publications', 'run-pointer');
		mkdirSync(generationDir, { recursive: true });
		const markdownPath = 'docs/.okf/dev/raw/fixture/page.md';
		const markdown = '# Published fixture';
		mkdirSync(join(root, 'docs', '.okf', 'dev', 'raw', 'fixture'), { recursive: true });
		writeFileSync(join(root, markdownPath), markdown);
		const row = {
			schema_version: 'okf.dev.corpus.v1', source_id: 'fixture', source_ref: 'fixture:page',
			url: 'https://example.org/page', title: 'Published fixture', content_hash: sha(markdown),
			fetched_at: daysAgo(1), markdown_path: markdownPath
		};
		const corpusBytes = Buffer.from(`${JSON.stringify(row)}\n`);
		const indexBytes = Buffer.from('# Published index');
		const summaryBytes = Buffer.from('{}');
		writeFileSync(join(generationDir, 'corpus.jsonl'), corpusBytes);
		writeFileSync(join(generationDir, 'index.md'), indexBytes);
		writeFileSync(join(generationDir, 'summary.json'), summaryBytes);
		const checksum = (bytes: Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
		const generation = {
			schema: 'atlas.okf-dev-corpus-generation.v1', run_id: 'run-pointer', canonical_authority: false,
			artifacts: { 'corpus.jsonl': checksum(corpusBytes), 'index.md': checksum(indexBytes), 'summary.json': checksum(summaryBytes) }
		};
		const generationBytes = Buffer.from(JSON.stringify(generation));
		writeFileSync(join(generationDir, 'manifest.json'), generationBytes);
		writeFileSync(join(dev, 'published-current.json'), JSON.stringify({
			schema: 'atlas.okf-crawl-publication-receipt.v1', run_id: 'run-pointer',
			generation_manifest: '.publications/run-pointer/manifest.json',
			generation_manifest_checksum: checksum(generationBytes),
			publication_status: 'PUBLISHED_READBACK_VERIFIED', canonical_authority: false
		}));

		const publishedCapture = collectLocalCaptures(root, RUNTIME);
		expect(publishedCapture.issues).toEqual([]);
		expect(publishedCapture.sources.some((source) => source.sourceUrl === 'https://example.org/page')).toBe(true);
		writeFileSync(join(generationDir, 'summary.json'), 'tampered');
		expect(collectLocalCaptures(root, RUNTIME).issues.map((issue) => issue.code)).toContain('DEV_PUBLICATION_INVALID');
		expect(collectLocalCaptures(root, RUNTIME).sources.some((source) => source.sourceUrl === 'https://example.org/page')).toBe(false);
	});

	it('resolves portable corpus markdown paths against the repository root', async () => {
		const markdown = '# Zod schema parsing\nZod provides schema parsing and validation.';
		const markdownPath = 'docs/.okf/dev/raw/zod/zod-dev-index.md';
		writeDev([{
			source_id: 'zod', source_ref: 'zod:zod-dev-index', url: 'https://zod.dev/', title: 'Zod',
			content_hash: sha(markdown), fetched_at: daysAgo(1), markdown_path: markdownPath
		}]);
		const filePath = join(root, markdownPath);
		mkdirSync(join(root, 'docs', '.okf', 'dev', 'raw', 'zod'), { recursive: true });
		writeFileSync(filePath, markdown);
		const result = await searchDocCorpus({ pool: null, root, q: 'zod schema parsing' });
		expect(result.hits).toHaveLength(1);
		expect(result.hits[0]).toMatchObject({ sourceId: 'zod', sourceClass: 'GENERATED_CORPUS', badge: 'GENERATED_CORPUS' });
	});

	it('finds the newly indexed OpenWiki documentation through local lexical search only', async () => {
		const result = await searchDocCorpus({ pool: null, root: findRepoRoot(), q: 'coding-agent integrations', limit: 5 });
		expect(result.mode).toBe('LOCAL_LEXICAL');
		expect(result.hits.some((hit) => hit.sourceId === 'openwiki-agent-docs'
			&& hit.sourceClass === 'GENERATED_CORPUS' && hit.badge === 'GENERATED_CORPUS')).toBe(true);
	});
});

describe('dense search', () => {
	const vec = Array.from({ length: 768 }, (_, i) => (i % 7) / 10);
	const row = { chunk_id: 'doc:x:1:2', chunk_evidence_revision: 'sha256:c', heading_path: ['A'], page_id: 'p1', title: 'T', provider: 'x', product: 'x', product_version: '1', url: 'https://x', source_authority: 'OFFICIAL', page_evidence_revision: 'sha256:p', excerpt: 'e' };
	const poolWith = (rows: Record<string, unknown>[], fail = false) => {
		const calls: { sql: string; params: unknown[] }[] = [];
		return { calls, pool: { async query(sql: string, params: unknown[]) { calls.push({ sql, params }); if (fail) throw new Error('down'); return { rows }; } } as never };
	};

	it('returns canonical hits with page/chunk evidence and a structured parity receipt', async () => {
		const { pool, calls } = poolWith([row]);
		const r = await searchDocCorpusDense({ pool, queryVector: vec, limit: 99, product: 'x', productVersion: '1' });
		expect(r.mode).toBe('POSTGRES_DENSE');
		expect(r.hits[0]).toMatchObject({ sourceClass: 'CANONICAL', chunkId: 'doc:x:1:2', chunkEvidenceRevision: 'sha256:c', revision: 'sha256:p' });
		expect(r.representationCaveat).toMatch(/PARITY_UNPROVEN/);
		expect(r.representationAdmission).toEqual({
			status: 'PARITY_UNPROVEN', queryDimension: 768, corpusDimension: 768,
			queryRecipeRevision: null, corpusRecipeRevision: null, proofUsable: false
		});
		expect(r.queryIdentity).toEqual({ vectorChecksum: `sha256:${sha(JSON.stringify(vec))}`, queryRecipeRevision: null });
		expect(calls[0].params.slice(1)).toEqual([25, 'x', '1']);
		expect(calls[0].sql).toContain('ORDER BY c.content_embedding <=> $1::vector, c.chunk_id');
		expect(calls[0].sql).not.toMatch(/(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)/i);
	});

	it('rejects a wrong-length or non-finite vector without touching the database', async () => {
		const { pool, calls } = poolWith([row]);
		for (const bad of [vec.slice(0, 767), [...vec.slice(1), Number.NaN], [...vec.slice(1), Infinity], [...vec.slice(1), -Infinity]]) {
			const r = await searchDocCorpusDense({ pool, queryVector: bad });
			expect(r.hits).toEqual([]); expect(r.postgresNote).toBe('QUERY_VECTOR_INVALID');
		}
		expect(calls.length).toBe(0);
	});

	it('fails visibly with no local fallback when Postgres is absent or down', async () => {
		expect((await searchDocCorpusDense({ pool: null, queryVector: vec })).postgresNote).toMatch(/^POSTGRES_UNAVAILABLE:/);
		const r = await searchDocCorpusDense({ pool: poolWith([], true).pool, queryVector: vec });
		expect(r.hits).toEqual([]); expect(r.postgresNote).toMatch(/^POSTGRES_UNAVAILABLE:down/);
	});
});
