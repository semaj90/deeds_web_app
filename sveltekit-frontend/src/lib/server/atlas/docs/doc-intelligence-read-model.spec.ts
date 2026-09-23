// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	buildDocIntelligenceStudioSnapshotV1, collectLocalCaptures, computeCoverage, scanRequiredTerms, searchDocCorpus,
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
function fakePool(opts: { chunks?: number; ftsRows?: Record<string, string | null>[]; down?: boolean } = {}) {
	const statements: string[] = [];
	const pool = {
		async query(sql: string) {
			statements.push(sql);
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
	return { pool: pool as unknown as Pool, statements };
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
	it('returns canonical FTS hits with a CANONICAL badge and provenance', async () => {
		writeDev(); writeAllGroups();
		const { pool } = fakePool({ chunks: 3, ftsRows: [{ chunk_id: 'c1', title: 'pgvector', product: 'pgvector', product_version: '0.8.3', url: 'https://x', source_authority: 'OFFICIAL', evidence_revision: 'sha256:abc', excerpt: 'halfvec index' }] });
		const r = await searchDocCorpus({ pool, root, q: 'halfvec' });
		expect(r.mode).toBe('POSTGRES_FTS');
		expect(r.hits[0]).toMatchObject({ badge: 'CANONICAL_POSTGRES', productVersion: '0.8.3', revision: 'sha256:abc', authorityClass: 'OFFICIAL' });
	});

	it('falls back to local lexical search labelled REFERENCE_ONLY when Postgres is empty', async () => {
		writeDev(); writeAllGroups();
		const r = await searchDocCorpus({ pool: fakePool({ chunks: 0 }).pool, root, q: 'io_method' });
		expect(r.mode).toBe('LOCAL_LEXICAL');
		expect(r.postgresNote).toBe('DOC_CORPUS_POSTGRES_EMPTY');
		expect(r.hits.length).toBeGreaterThan(0);
		expect(new Set(r.hits.map((h) => h.badge))).toEqual(new Set(['REFERENCE_ONLY']));
	});

	it('returns no hits for an unmatched query and never a CANONICAL badge locally', async () => {
		writeDev(); writeAllGroups();
		const r = await searchDocCorpus({ pool: null, root, q: 'zzzz-not-present' });
		expect(r.hits).toEqual([]);
	});
});
