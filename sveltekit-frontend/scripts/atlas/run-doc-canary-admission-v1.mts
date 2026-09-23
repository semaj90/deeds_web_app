#!/usr/bin/env node
/**
 * DOC-CANARY-ADMISSION-01 runner: three pinned pages -> the REAL admitExternalDocPage -> exact readback (+ FTS) -> ROLLBACK -> counts back to baseline.
 *
 * DEFAULT = DRY RUN: validates the envelopes and prints the plan; opens NO database connection.
 * APPLY   = needs BOTH `--apply` and env ATLAS_DOC_CANARY_AUTHORIZED=I_AUTHORIZE_ROLLBACK_CANARY. Everything runs in one outer transaction that
 *           is ALWAYS rolled back (writer BEGIN/COMMIT/ROLLBACK are mapped to savepoints, see external-doc-canary-v1.ts). No embeddings, no :8081,
 *           no Qdrant/Valkey/Neo4j, no Graphify. Aborts (without writing) if the canonical tables are not empty at baseline.
 *
 * Run from sveltekit-frontend/:  npx tsx scripts/atlas/run-doc-canary-admission-v1.mts [--apply] [--pages 3]
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

import { admitExternalDocPage } from '../../src/lib/server/atlas/docs/external-doc-admission.js';
import { selectCanaryEnvelopes, wrapClientAsSavepointPool } from '../../src/lib/server/atlas/docs/external-doc-canary-v1.js';
import { toExternalDocAdmissionInputV1, validateExternalDocAdmissionHandoff, type ExternalDocAdmissionEnvelopeV1 } from '../../src/lib/server/atlas/docs/external-doc-intelligence-contracts-v1.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const ENVELOPES = resolve(ROOT, 'docs/.okf/pinned/admission-envelopes-v1.json');
const RECEIPT = resolve(ROOT, 'docs/reports/external-doc-canary-admission-v1.json');
const AUTH = 'I_AUTHORIZE_ROLLBACK_CANARY';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const pageCount = Number(args[args.indexOf('--pages') + 1] ?? 3) || 3;
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

async function main(): Promise<void> {
	const all = JSON.parse(readFileSync(ENVELOPES, 'utf8')) as ExternalDocAdmissionEnvelopeV1[];
	const handoff = validateExternalDocAdmissionHandoff(all);
	if (handoff.result !== 'EXTERNAL_DOC_ADMISSION_HANDOFF_READY') throw new Error(`HANDOFF_NOT_READY:${handoff.result}`);
	const chosen = selectCanaryEnvelopes(all, pageCount);
	const inputs = chosen.map((e) => toExternalDocAdmissionInputV1(e));
	const plan = chosen.map((e) => ({ sourceId: e.sourceId, url: e.page.url, chunks: e.chunks.length }));
	const receipt: Record<string, unknown> = {
		schema: 'atlas.external-doc-canary-admission.v1', gate: 'DOC-CANARY-ADMISSION-01', mode: apply ? 'APPLY_ROLLBACK' : 'DRY_RUN',
		generatedAt: new Date().toISOString(), plan, expectedChunks: plan.reduce((n, p) => n + p.chunks, 0)
	};

	if (!apply) {
		receipt.result = 'CANARY_DRY_RUN_READY';
		receipt.writes = { postgres: 0 };
		console.log(JSON.stringify(receipt, null, 2));
		return;
	}
	if (process.env.ATLAS_DOC_CANARY_AUTHORIZED !== AUTH) throw new Error('CANARY_NOT_AUTHORIZED: set ATLAS_DOC_CANARY_AUTHORIZED=' + AUTH);
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');

	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	const client = await pool.connect();
	let rolledBack = false;
	try {
		const count = async (): Promise<{ pages: number; chunks: number }> => {
			const p = await client.query('SELECT count(*)::int AS n FROM atlas_external_doc_pages');
			const c = await client.query('SELECT count(*)::int AS n FROM atlas_external_doc_chunks');
			return { pages: p.rows[0].n, chunks: c.rows[0].n };
		};
		const baseline = await count();
		if (baseline.pages !== 0 || baseline.chunks !== 0) throw new Error(`CANARY_BASELINE_NOT_EMPTY:${JSON.stringify(baseline)}`);
		await client.query('BEGIN');
		const wrapped = wrapClientAsSavepointPool(client);
		const receipts: Awaited<ReturnType<typeof admitExternalDocPage>>[] = [];
		for (const input of inputs) receipts.push(await admitExternalDocPage(wrapped as never, input));

		const readback: Record<string, unknown>[] = [];
		const failures: string[] = [];
		for (const input of inputs) {
			const rows = (await client.query(
				`SELECT c.chunk_id, c.ordinal, c.start_byte, c.end_byte, c.chunk_checksum, c.evidence_revision, c.text,
				        octet_length(c.text) AS bytes, encode(sha256(convert_to(c.text, 'UTF8')), 'hex') AS sha
				 FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id
				 WHERE p.evidence_revision = $1 ORDER BY c.ordinal`, [input.page.evidenceRevision]
			)).rows;
			if (rows.length !== input.chunks.length) failures.push(`COUNT:${input.page.url}`);
			for (const [j, row] of rows.entries()) {
				const want = input.chunks[j];
				if (row.chunk_id !== want.chunkId || row.evidence_revision !== want.evidenceRevision) failures.push(`IDENTITY:${want.chunkId}`);
				if (row.sha !== want.chunkChecksum || row.chunk_checksum !== want.chunkChecksum) failures.push(`CHECKSUM:${want.chunkId}`);
				if (Number(row.end_byte) - Number(row.start_byte) !== Number(row.bytes)) failures.push(`SPAN_LENGTH:${want.chunkId}`);
				if (sha(row.text) !== want.chunkChecksum) failures.push(`TEXT:${want.chunkId}`);
			}
			readback.push({ url: input.page.url, chunksReadBack: rows.length, expected: input.chunks.length });
		}
		// generated FTS: query a distinctive token from the first chunk of the first page
		const token = (inputs[0].chunks[0].text.match(/[A-Za-z]{6,}/) ?? [''])[0];
		const fts = (await client.query(`SELECT count(*)::int AS n FROM atlas_external_doc_chunks WHERE search_vector @@ plainto_tsquery('english', $1)`, [token])).rows[0].n;
		if (!token || fts < 1) failures.push(`FTS:${token}`);
		const inside = await count();
		if (inside.pages !== inputs.length || inside.chunks !== plan.reduce((n, p) => n + p.chunks, 0)) failures.push(`INSIDE_COUNTS:${JSON.stringify(inside)}`);

		await client.query('ROLLBACK');
		rolledBack = true;
		const after = await count();
		if (after.pages !== 0 || after.chunks !== 0) failures.push(`ROLLBACK_NOT_CLEAN:${JSON.stringify(after)}`);
		Object.assign(receipt, {
			baseline, inside, afterRollback: after, ftsToken: token, ftsHits: fts, readback, failures,
			admissionReceipts: receipts.map((r) => ({ pageEvidenceRevision: r.pageEvidenceRevision, chunkCount: r.chunkCount })),
			writes: { postgres: 'ROLLED_BACK' }, result: failures.length === 0 ? 'DOC_CANARY_ADMISSION_ROLLBACK_PROVEN' : 'DOC_CANARY_FAILED'
		});
		writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2) + '\n');
		console.log(JSON.stringify({ result: receipt.result, failures }, null, 2));
		if (failures.length) process.exitCode = 1;
	} finally {
		if (!rolledBack) await client.query('ROLLBACK').catch(() => undefined);
		client.release();
		await pool.end();
	}
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
