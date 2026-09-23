#!/usr/bin/env node
/**
 * Studio canonical external-doc FTS proof (READ ONLY). Runs the real Studio read model (`searchDocCorpus`) against live Postgres and compares every result with an
 * independent direct SQL query: chunkId, chunkEvidenceRevision, product/version, page identity and snippet-source text. Also proves version filters, canonical zero
 * hits, and the database-failure fallback labelling. Writes only docs/reports/doc-corpus-studio-canonical-fts-v1.json.
 * Run from sveltekit-frontend/:  npx tsx scripts/atlas/prove-studio-canonical-fts-v1.mts
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { findRepoRoot, searchDocCorpus, type DocSearchHit } from '../../src/lib/server/atlas/docs/doc-intelligence-read-model.js';

const OUT = resolve(import.meta.dirname, '..', '..', '..', 'docs/reports/doc-corpus-studio-canonical-fts-v1.json');
const TERMS = ['hnsw.iterative_scan', 'hnsw.scan_mem_multiplier', 'io_method', 'Bitmap Heap Scan', 'uuidv7', 'drizzle-kit', '$derived'];
const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
const plain = (excerpt: string) => norm(excerpt.split('«').join('').split('»').join('')).replace(/^\.\.\.\s*|\s*\.\.\.$/g, '');
// ts_headline treats <...> as markup and splices around it in the DISPLAYED snippet (stored text is untouched), so a strict substring check cannot hold for markup-bearing chunks.
// Snippet-source proof: (1) exact substring when possible, else (2) every highlighted term and every word of the snippet occurs in THAT row's own text.
const stripTags = (t: string) => norm(t.replace(/<[^>]*>/g, ''));
const words = (t: string) => new Set((t.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? []));
const highlighted = (excerpt: string) => [...excerpt.matchAll(/«([^»]+)»/g)].map((m) => m[1].toLowerCase());
let snippetSubstringExact = 0;
let snippetSubsetOnly = 0;

async function main(): Promise<void> {
	const root = findRepoRoot();
	const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
	const failures: string[] = [];
	try {
		await pool.query('BEGIN READ ONLY');
		const corp = (await pool.query(`SELECT (SELECT count(*)::int FROM atlas_external_doc_pages) pages, (SELECT count(*)::int FROM atlas_external_doc_chunks) chunks, (SELECT count(*)::int FROM atlas_external_doc_analyses) analyses`)).rows[0];
		if (corp.pages !== 30 || corp.chunks !== 852) failures.push(`CORPUS_COUNTS:${JSON.stringify(corp)}`);

		const direct = async (q: string, limit: number, product: string | null = null, version: string | null = null) => (await pool.query(
			`SELECT c.chunk_id, c.evidence_revision AS chunk_rev, c.text, c.heading_path, p.id AS page_id, p.product, p.product_version, p.provider, p.url, p.evidence_revision AS page_rev
			   FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id
			  WHERE c.search_vector @@ plainto_tsquery('english', $1) AND ($3::text IS NULL OR p.product = $3) AND ($4::text IS NULL OR p.product_version = $4)
			  ORDER BY ts_rank(c.search_vector, plainto_tsquery('english', $1)) DESC, c.chunk_id LIMIT $2`, [q, limit, product, version])).rows;
		const total = async (q: string) => Number((await pool.query(`SELECT count(*)::int n FROM atlas_external_doc_chunks WHERE search_vector @@ plainto_tsquery('english', $1)`, [q])).rows[0].n);

		const queries: Record<string, unknown>[] = [];
		const parity: Record<string, unknown>[] = [];
		for (const q of TERMS) {
			const studio = await searchDocCorpus({ pool, root, q, limit: 25 });
			const rows = await direct(q, 25);
			const n = await total(q);
			if (studio.mode !== 'POSTGRES_FTS') failures.push(`MODE:${q}:${studio.mode}`);
			let exact = studio.hits.length === rows.length;
			const perHit: boolean[] = [];
			studio.hits.forEach((h: DocSearchHit, i: number) => {
				const r = rows[i];
				const ok = !!r && h.chunkId === r.chunk_id && h.chunkEvidenceRevision === r.chunk_rev && h.pageId === r.page_id && h.revision === r.page_rev && h.product === r.product &&
					h.productVersion === r.product_version && h.provider === r.provider && h.url === r.url && h.sourceClass === 'CANONICAL' && h.badge === 'CANONICAL_POSTGRES' &&
					JSON.stringify(h.headingPath) === JSON.stringify(r.heading_path) && (() => {
						if (norm(r.text).includes(plain(h.excerpt))) { snippetSubstringExact++; return true; }
						const src = words(r.text);
						const okWords = [...words(plain(h.excerpt))].every((w) => src.has(w));
						const okMarks = highlighted(h.excerpt).every((m) => norm(r.text).toLowerCase().includes(m) || stripTags(r.text).toLowerCase().includes(m));
						if (okWords && okMarks) { snippetSubsetOnly++; return true; }
						return false;
					})();
				perHit.push(ok); if (!ok) exact = false;
			});
			if (!exact) failures.push(`PARITY:${q}`);
			if (studio.hits.length === 0 || n === 0) failures.push(`NO_HITS:${q}`);
			const top = studio.hits[0];
			queries.push({ query: q, canonicalHitCount: n, returned: studio.hits.length, mode: studio.mode, source: 'CANONICAL_POSTGRES',
				top: top ? { product: top.product, productVersion: top.productVersion, url: top.url, chunkId: top.chunkId, chunkEvidenceRevision: top.chunkEvidenceRevision, sourceClass: top.sourceClass } : null });
			parity.push({ query: q, studioHits: studio.hits.length, directRows: rows.length, orderedIdentityExact: exact, hitsChecked: perHit.length, hitsExact: perHit.filter(Boolean).length,
				fields: ['chunkId', 'chunkEvidenceRevision', 'pageId', 'pageEvidenceRevision', 'provider', 'product', 'productVersion', 'url', 'headingPath', 'snippet-in-source-row-text'] });
		}

		// version qualification: every distinct stored version is exposed exactly as stored (no invented semver)
		const versions = (await pool.query(`SELECT product, product_version, count(*)::int pages FROM atlas_external_doc_pages GROUP BY 1, 2 ORDER BY 1, 2`)).rows;
		const versionQualification: Record<string, unknown>[] = [];
		for (const v of versions) {
			const rows = await direct('the', 3, v.product, v.product_version);
			const studio = await searchDocCorpus({ pool, root, q: 'the', limit: 3, product: v.product, productVersion: v.product_version });
			const ok = studio.hits.every((h) => h.product === v.product && h.productVersion === v.product_version) && studio.hits.map((h) => h.chunkId).join() === rows.map((r) => r.chunk_id).join();
			if (!ok) failures.push(`VERSION_FILTER:${v.product}@${v.product_version}`);
			versionQualification.push({ product: v.product, productVersion: v.product_version, pages: v.pages, qualification: /^(CURRENT_UPSTREAM|UNVERSIONED)@/.test(v.product_version) ? v.product_version.split('@')[0] : 'DECLARED_VERSION', exposedExactly: ok, filteredHits: studio.hits.length });
		}

		// zero hits: canonical, empty, no reference fallback
		const zero = await searchDocCorpus({ pool, root, q: 'zzqxjkvw', limit: 5 });
		const zeroOk = zero.mode === 'POSTGRES_FTS' && zero.hits.length === 0 && zero.postgresNote === null;
		if (!zeroOk) failures.push('ZERO_HIT_NOT_CANONICAL_EMPTY');
		await pool.query('ROLLBACK');

		// database failure: unreachable pool -> visible fallback, never CANONICAL
		const dead = new Pool({ host: '127.0.0.1', port: 1, user: 'x', password: 'x', database: 'x', connectionTimeoutMillis: 800 });
		let fallback: Record<string, unknown>;
		try {
			const r = await searchDocCorpus({ pool: dead, root, q: 'io_method', limit: 5 });
			const ok = r.mode === 'LOCAL_LEXICAL' && !!r.postgresNote?.startsWith('POSTGRES_UNAVAILABLE:') && r.hits.every((h) => h.sourceClass !== 'CANONICAL' && h.badge !== 'CANONICAL_POSTGRES' && h.chunkId === null);
			if (!ok) failures.push('FALLBACK_LABELLING');
			fallback = { mode: r.mode, postgresNote: r.postgresNote, hits: r.hits.length, sourceClasses: [...new Set(r.hits.map((h) => h.sourceClass))], neverCanonical: ok };
		} finally { await dead.end().catch(() => undefined); }

		const result = failures.length === 0 ? 'STUDIO_CANONICAL_EXTERNAL_DOC_FTS_PROVEN' : 'STUDIO_CANONICAL_EXTERNAL_DOC_FTS_FAILED';
		const receipt = {
			schema: 'atlas.doc-corpus-studio-canonical-fts.v1', generatedAt: new Date().toISOString(),
			canonicalCorpus: { pages: corp.pages, chunks: corp.chunks, analyses: corp.analyses },
			canonicalReadOwner: 'sveltekit-frontend/src/lib/server/atlas/docs/doc-intelligence-read-model.ts searchDocCorpus (generated atlas_external_doc_chunks.search_vector + its GIN index; no BM25/pg_search/new column/Qdrant)',
			queries, directSqlParity: parity, versionQualification,
			zeroHit: { query: 'zzqxjkvw', mode: zero.mode, hits: zero.hits.length, postgresNote: zero.postgresNote, canonicalEmptyNotFallback: zeroOk },
			fallbackBehavior: { onDatabaseFailure: fallback!, note: 'a database failure falls back to local reference results but they are labelled LOCAL_LEXICAL / REFERENCE_ONLY|GENERATED_CORPUS with a POSTGRES_UNAVAILABLE note and are never CANONICAL; canonical zero hits do NOT fall back' },
			ssrProof: { specs: ['src/routes/(app)/admin/atlas/DocCorpusPanel.ssr.spec.ts', 'src/routes/(app)/admin/atlas/DocCorpusPanel.live.spec.ts (ATLAS_LIVE_DOC_DB=1)'], plainGetForm: 'GET /admin/atlas?docq=&docprod=&docver=, server-rendered, no client JavaScript required' },
			provenanceProof: 'every canonical hit carries sourceClass CANONICAL, pageId, chunkId, chunkEvidenceRevision (chunk grain, distinct from page revision), provider/product/productVersion, url, headingPath; local hits carry REFERENCE_ONLY/GENERATED_CORPUS and null canonical ids',
			snippetFidelityNote: { hitsWithExactSubstringSnippet: snippetSubstringExact, hitsWithSubsetOnlySnippet: snippetSubsetOnly, check: 'exact substring, else every highlighted term and snippet word occurs in that same row text', cause: 'PostgreSQL ts_headline treats <...> as markup and splices around it in the displayed snippet only; atlas_external_doc_chunks.text and chunk checksums are unchanged', followUp: 'if verbatim code snippets matter, render the snippet from row text with offsets instead of ts_headline' },
			failures, result,
			writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 }
		};
		writeFileSync(OUT, JSON.stringify(receipt, null, 2) + '\n');
		console.log(JSON.stringify({ result, failures, corpus: corp, queries: queries.map((q) => `${q.query}: ${q.canonicalHitCount} (${(q.top as { product: string } | null)?.product})`), parityExact: parity.every((p) => p.orderedIdentityExact), zero: zeroOk, fallback: fallback!, versions: versionQualification.length }, null, 2));
		if (failures.length) process.exitCode = 1;
	} finally {
		await pool.end();
	}
}

main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; });
