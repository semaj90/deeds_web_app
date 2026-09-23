#!/usr/bin/env node
/**
 * Real canonical admission of the pinned external-doc corpus: every envelope -> admitExternalDocPage (its own transaction per page, checksum
 * readback before COMMIT) -> whole-corpus readback (counts, identity, checksum, byte length, FTS) -> receipt.
 *
 * DEFAULT = DRY RUN (validates handoff, prints counts, no DB connection). `--apply` needs env ATLAS_DOC_ADMISSION_AUTHORIZED=I_AUTHORIZE_CANONICAL_ADMISSION.
 * Refuses to run if the canonical tables already hold rows (first load only). No embeddings, no :8081, no Qdrant/Valkey/Neo4j, no Graphify.
 * Run from sveltekit-frontend/:  npx tsx scripts/atlas/run-external-doc-admission-v1.mts [--apply]
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

import { admitExternalDocPage } from '../../src/lib/server/atlas/docs/external-doc-admission.js';
import { toExternalDocAdmissionInputV1, validateExternalDocAdmissionHandoff, type ExternalDocAdmissionEnvelopeV1 } from '../../src/lib/server/atlas/docs/external-doc-intelligence-contracts-v1.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const ENVELOPES = resolve(ROOT, 'docs/.okf/pinned/admission-envelopes-v1.json');
const RECEIPT = resolve(ROOT, 'docs/reports/external-doc-canonical-admission-v1.json');
const AUTH = 'I_AUTHORIZE_CANONICAL_ADMISSION';
const apply = process.argv.includes('--apply');
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

async function main(): Promise<void> {
	const all = JSON.parse(readFileSync(ENVELOPES, 'utf8')) as ExternalDocAdmissionEnvelopeV1[];
	const handoff = validateExternalDocAdmissionHandoff(all);
	if (handoff.result !== 'EXTERNAL_DOC_ADMISSION_HANDOFF_READY') throw new Error(`HANDOFF_NOT_READY:${handoff.result}`);
	const inputs = all.map((e) => toExternalDocAdmissionInputV1(e));
	const expected = { pages: inputs.length, chunks: inputs.reduce((n, i) => n + i.chunks.length, 0) };
	if (!apply) {
		console.log(JSON.stringify({ mode: 'DRY_RUN', expected, result: 'ADMISSION_DRY_RUN_READY', writes: { postgres: 0 } }, null, 2));
		return;
	}
	if (process.env.ATLAS_DOC_ADMISSION_AUTHORIZED !== AUTH) throw new Error(`ADMISSION_NOT_AUTHORIZED: set ATLAS_DOC_ADMISSION_AUTHORIZED=${AUTH}`);
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	try {
		const count = async () => {
			const p = (await pool.query('SELECT count(*)::int AS n FROM atlas_external_doc_pages')).rows[0].n as number;
			const c = (await pool.query('SELECT count(*)::int AS n FROM atlas_external_doc_chunks')).rows[0].n as number;
			return { pages: p, chunks: c };
		};
		const baseline = await count();
		if (baseline.pages !== 0 || baseline.chunks !== 0) throw new Error(`ADMISSION_BASELINE_NOT_EMPTY:${JSON.stringify(baseline)}`);
		const receipts: Awaited<ReturnType<typeof admitExternalDocPage>>[] = [];
		const failed: string[] = [];
		for (const input of inputs) {
			try { receipts.push(await admitExternalDocPage(pool, input)); }
			catch (e) { failed.push(`${input.page.url}: ${e instanceof Error ? e.message : e}`); }
		}
		const after = await count();
		const failures: string[] = [...failed.map((f) => `ADMIT:${f}`)];
		if (after.pages !== expected.pages || after.chunks !== expected.chunks) failures.push(`COUNTS:${JSON.stringify(after)} expected ${JSON.stringify(expected)}`);
		let verified = 0;
		for (const input of inputs) {
			const rows = (await pool.query(
				`SELECT c.chunk_id, c.chunk_checksum, c.evidence_revision, c.start_byte, c.end_byte, c.text,
				        encode(sha256(convert_to(c.text, 'UTF8')), 'hex') AS sha
				 FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id
				 WHERE p.evidence_revision = $1 ORDER BY c.ordinal`, [input.page.evidenceRevision])).rows;
			if (rows.length !== input.chunks.length) { failures.push(`PAGE_CHUNKS:${input.page.url}`); continue; }
			rows.forEach((row, j) => {
				const want = input.chunks[j];
				const okRow = row.chunk_id === want.chunkId && row.evidence_revision === want.evidenceRevision && row.sha === want.chunkChecksum &&
					row.chunk_checksum === want.chunkChecksum && sha(row.text) === want.chunkChecksum &&
					Number(row.end_byte) - Number(row.start_byte) === Buffer.byteLength(row.text, 'utf8');
				if (okRow) verified += 1; else failures.push(`ROW:${want.chunkId}`);
			});
		}
		const fts = (await pool.query(`SELECT count(*)::int AS n FROM atlas_external_doc_chunks WHERE search_vector @@ plainto_tsquery('english', 'snippet')`)).rows[0].n as number;
		if (fts < 1) failures.push('FTS:snippet');
		const versions = (await pool.query(`SELECT count(DISTINCT (provider, product, product_version))::int AS n FROM atlas_external_doc_pages`)).rows[0].n as number;
		const result = failures.length === 0 ? 'EXTERNAL_DOC_CANONICAL_ADMISSION_PROVEN' : 'EXTERNAL_DOC_CANONICAL_ADMISSION_FAILED';
		writeFileSync(RECEIPT, JSON.stringify({
			schema: 'atlas.external-doc-canonical-admission.v1', generatedAt: new Date().toISOString(), baseline, expected, after,
			chunkRowsVerified: verified, ftsHitsForSnippet: fts, distinctProductVersions: versions, failures, result,
			admissionReceipts: receipts.map((r) => ({ pageEvidenceRevision: r.pageEvidenceRevision, chunkCount: r.chunkCount, transactionCommitted: r.transactionCommitted })),
			writes: { postgres: 'COMMITTED', qdrant: 0, valkey: 0, neo4j: 0 }
		}, null, 2) + '\n');
		console.log(JSON.stringify({ result, after, chunkRowsVerified: verified, fts, failures }, null, 2));
		if (failures.length) process.exitCode = 1;
	} finally {
		await pool.end();
	}
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
