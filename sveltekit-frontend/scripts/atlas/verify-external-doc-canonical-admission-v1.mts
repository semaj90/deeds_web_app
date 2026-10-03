#!/usr/bin/env node
/**
 * READ-ONLY verification of the canonical external-doc corpus in Postgres against the expected admission envelopes.
 * Classifies the live state (NOT_RUN 0/0, PROVEN 30/852 exact, PARTIAL, READBACK_FAILED), and only for an exact corpus runs bounded canonical FTS searches.
 * One `BEGIN READ ONLY` transaction; merges its findings into docs/reports/external-doc-canonical-admission-v1.json (preserving the runner's own admission receipt).
 * Run from sveltekit-frontend/:  npx tsx scripts/atlas/verify-external-doc-canonical-admission-v1.mts
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

import { toExternalDocAdmissionInputV1, type ExternalDocAdmissionEnvelopeV1 } from '../../src/lib/server/atlas/docs/external-doc-intelligence-contracts-v1.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const ENVELOPES = resolve(ROOT, 'docs/.okf/pinned/admission-envelopes-v1.json');
const RECEIPT = resolve(ROOT, 'docs/reports/external-doc-canonical-admission-v1.json');
const SEARCH_TERMS = ['hnsw.iterative_scan', 'hnsw.scan_mem_multiplier', 'io_method', 'Bitmap Heap Scan', 'uuidv7', 'drizzle-kit', '$derived'];
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const dupGroups = (values: string[]) => { const m = new Map<string, number>(); for (const v of values) m.set(v, (m.get(v) ?? 0) + 1); return [...m.values()].filter((n) => n > 1).length; };

async function main(): Promise<void> {
	const envelopes = JSON.parse(readFileSync(ENVELOPES, 'utf8')) as ExternalDocAdmissionEnvelopeV1[];
	const expected = envelopes.map((e) => toExternalDocAdmissionInputV1(e));
	const expectedPages = expected.length;
	const expectedChunks = expected.reduce((n, i) => n + i.chunks.length, 0);

	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	const client = await pool.connect();
	const failures: string[] = [];
	const out: Record<string, unknown> = {};
	try {
		await client.query('BEGIN READ ONLY');
		const n = async (table: string) => (await client.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n as number;
		const live = { pages: await n('atlas_external_doc_pages'), chunks: await n('atlas_external_doc_chunks'), analyses: await n('atlas_external_doc_analyses') };
		out.liveReadback = live;
		let state: 'NOT_RUN' | 'FULL' | 'PARTIAL' = live.pages === 0 && live.chunks === 0 ? 'NOT_RUN' : live.pages === expectedPages && live.chunks === expectedChunks ? 'FULL' : 'PARTIAL';
		out.liveState = state;

		if (state === 'PARTIAL') {
			const pages = (await client.query('SELECT url, product_version, evidence_revision, (SELECT count(*)::int FROM atlas_external_doc_chunks c WHERE c.page_id = p.id) AS chunks FROM atlas_external_doc_pages p ORDER BY url')).rows;
			const have = new Set(pages.map((p) => p.evidence_revision as string));
			out.partialInventory = {
				admittedPages: pages, expectedButMissing: expected.filter((e) => !have.has(e.page.evidenceRevision)).map((e) => e.page.url),
				unexpectedPages: pages.filter((p) => !expected.some((e) => e.page.evidenceRevision === p.evidence_revision)).map((p) => p.url)
			};
		}

		if (state === 'FULL') {
			const pageRows = (await client.query(`SELECT id, provider, product, product_version, architecture, url, content_hash, evidence_revision FROM atlas_external_doc_pages`)).rows;
			const chunkRows = (await client.query(`SELECT c.chunk_id, c.ordinal, c.start_byte, c.end_byte, c.text, c.chunk_checksum, c.evidence_revision, p.evidence_revision AS page_rev
				FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id`)).rows;
			const pageByRev = new Map(pageRows.map((p) => [p.evidence_revision as string, p]));
			const chunkById = new Map(chunkRows.map((c) => [c.chunk_id as string, c]));
			let pageOk = 0, chunkOk = 0, checksumOk = 0, spanOk = 0, textOk = 0;
			for (const e of expected) {
				const p = pageByRev.get(e.page.evidenceRevision);
				if (!p) { failures.push(`PAGE_MISSING:${e.page.url}`); continue; }
				if (p.url === e.page.url && p.content_hash === e.page.contentHash && p.provider === e.page.provider && p.product === e.page.product && p.product_version === e.page.productVersion && (p.architecture ?? null) === (e.page.architecture ?? null)) pageOk++;
				else failures.push(`PAGE_MISMATCH:${e.page.url}`);
				for (const c of e.chunks) {
					const row = chunkById.get(c.chunkId);
					if (!row) { failures.push(`CHUNK_MISSING:${c.chunkId}`); continue; }
					if (row.evidence_revision === c.evidenceRevision && row.page_rev === e.page.evidenceRevision && Number(row.ordinal) === c.ordinal) chunkOk++; else failures.push(`CHUNK_IDENTITY:${c.chunkId}`);
					if (row.chunk_checksum === c.chunkChecksum && sha(row.text) === c.chunkChecksum) checksumOk++; else failures.push(`CHECKSUM:${c.chunkId}`);
					if (Number(row.start_byte) === c.startByte && Number(row.end_byte) === c.endByte && Number(row.end_byte) - Number(row.start_byte) === Buffer.byteLength(row.text, 'utf8')) spanOk++; else failures.push(`SPAN:${c.chunkId}`);
					if (row.text === c.text) textOk++; else failures.push(`TEXT:${c.chunkId}`);
				}
			}
			const expectedChunkIds = new Set(expected.flatMap((e) => e.chunks.map((c) => c.chunkId)));
			const unexpectedChunks = chunkRows.filter((c) => !expectedChunkIds.has(c.chunk_id as string)).length;
			const unexpectedPages = pageRows.filter((p) => !expected.some((e) => e.page.evidenceRevision === p.evidence_revision)).length;
			if (unexpectedChunks || unexpectedPages) failures.push(`UNEXPECTED_ROWS:pages=${unexpectedPages},chunks=${unexpectedChunks}`);
			out.identity = {
				uniquePageEvidenceRevisions: new Set(pageRows.map((p) => p.evidence_revision)).size, uniqueChunkEvidenceRevisions: new Set(chunkRows.map((c) => c.evidence_revision)).size,
				uniqueChunkIds: new Set(chunkRows.map((c) => c.chunk_id)).size,
				duplicatePageGroups: dupGroups(pageRows.map((p) => p.evidence_revision as string)), duplicateChunkGroups: dupGroups(chunkRows.map((c) => c.evidence_revision as string)),
				unexpectedPages, unexpectedChunks, distinctProductVersions: new Set(pageRows.map((p) => `${p.provider}/${p.product}/${p.product_version}`)).size
			};
			out.parity = { pagesMatching: pageOk, chunksIdentityMatching: chunkOk, checksumsMatching: checksumOk, spansMatching: spanOk, textMatching: textOk };

			const fts: Record<string, unknown>[] = [];
			for (const term of SEARCH_TERMS) {
				const q = await client.query(
					`SELECT c.chunk_id, c.evidence_revision, p.product, p.product_version, p.url,
					        count(*) OVER ()::int AS total, position(lower($2) in lower(c.text)) > 0 AS literal
					 FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id
					 WHERE c.search_vector @@ plainto_tsquery('english', $1)
					 ORDER BY ts_rank(c.search_vector, plainto_tsquery('english', $1)) DESC, c.chunk_id LIMIT 1`, [term, term]);
				const lit = (await client.query(`SELECT count(*)::int AS n FROM atlas_external_doc_chunks WHERE position(lower($1) in lower(text)) > 0`, [term])).rows[0].n as number;
				const top = q.rows[0];
				fts.push({ query: term, ftsHits: top?.total ?? 0, literalTextHits: lit, source: 'CANONICAL_POSTGRES',
					topHit: top ? { product: top.product, productVersion: top.product_version, url: top.url, chunkId: top.chunk_id, chunkEvidenceRevision: top.evidence_revision, containsLiteral: top.literal } : null });
			}
			out.ftsProof = fts;
			if (live.analyses !== 0) failures.push(`ANALYSES_NOT_EMPTY:${live.analyses}`);
			if (fts.every((f) => (f.ftsHits as number) === 0 && (f.literalTextHits as number) === 0)) failures.push('FTS_NO_HITS');
		}
		await client.query('ROLLBACK');

		const result = state === 'NOT_RUN' ? 'EXTERNAL_DOC_CANONICAL_ADMISSION_NOT_RUN'
			: state === 'PARTIAL' ? 'EXTERNAL_DOC_CANONICAL_ADMISSION_PARTIAL'
			: failures.length ? 'EXTERNAL_DOC_CANONICAL_ADMISSION_READBACK_FAILED' : 'EXTERNAL_DOC_CANONICAL_ADMISSION_PROVEN';
		const prior = existsSync(RECEIPT) ? JSON.parse(readFileSync(RECEIPT, 'utf8')) : {};
		const final = {
			...prior,
			schema: 'atlas.external-doc-canonical-admission.v2',
			verifiedAt: new Date().toISOString(),
			authorization: { operator: 'explicit "admit all 30 pages" (confirmed through the question prompt, 2026-09-23)', scope: 'permanent canonical admission of the pinned 30-page / 852-chunk corpus; no cleanup/destructive reconciliation' },
			expected: { pages: expectedPages, chunks: expectedChunks },
			...out,
			failures,
			runnerRecoverySemantics: {
				classification: 'PARTIAL_COMMIT_RECOVERY_GAP',
				detail: 'run-external-doc-admission-v1.mts calls admitExternalDocPage once per page, each in its own committed transaction, and refuses to start unless both canonical tables are empty. A crash after page N would leave a valid partial corpus that a naive rerun refuses to resume. Not triggered here (all 30 pages committed); recorded as a reliability follow-up (resumable first-load: exact readback of already-admitted pages, admit only missing ones, fail closed on conflicts).'
			},
			result,
			writes: { postgres: { performed: 'by the earlier authorized --apply (this verification wrote nothing)', pages: live.pages, chunks: live.chunks }, qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 }
		};
		writeFileSync(RECEIPT, JSON.stringify(final, null, 2) + '\n');
		console.log(JSON.stringify({ liveState: state, live, result, failures: failures.slice(0, 10), parity: out.parity, identity: out.identity,
			fts: (out.ftsProof as Record<string, unknown>[] | undefined)?.map((f) => `${f.query}: fts=${f.ftsHits} literal=${f.literalTextHits}`) }, null, 2));
		if (failures.length || result !== 'EXTERNAL_DOC_CANONICAL_ADMISSION_PROVEN') process.exitCode = 1;
	} finally {
		client.release();
		await pool.end();
	}
}

main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; });
