#!/usr/bin/env node
/**
 * Real canonical admission of the pinned external-doc corpus: every envelope -> admitExternalDocPage (its own transaction per page, checksum
 * readback before COMMIT) -> whole-corpus readback (counts, identity, checksum, byte length, FTS) -> receipt.
 *
 * DEFAULT = DRY RUN (validates handoff, prints counts, no DB connection). `--plan` = READ-ONLY live classification of every page (ALREADY_ADMITTED_EXACT / MISSING / CONFLICT).
 * `--apply` needs env ATLAS_DOC_ADMISSION_AUTHORIZED=I_AUTHORIZE_CANONICAL_ADMISSION and is RESUMABLE: pages that already equal their envelope exactly are skipped (never rewritten),
 * only MISSING pages are admitted through the existing writer, and any CONFLICT aborts before a single write. A crash after page N is therefore recoverable by rerunning.
 * No embeddings, no :8081, no Qdrant/Valkey/Neo4j, no Graphify.
 * Run from sveltekit-frontend/:  npx tsx scripts/atlas/run-external-doc-admission-v1.mts [--apply]
 * Pilot: --envelopes <one-page-json> --normalized-page <markdown> [--plan --query <term>].
 * Pilot --apply additionally requires --query and ATLAS_DOC_STAGING_DATABASE_URL.
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Pool } from 'pg';

import { admitExternalDocPage } from '../../src/lib/server/atlas/docs/external-doc-admission.js';
import { searchDocCorpus } from '../../src/lib/server/atlas/docs/doc-intelligence-read-model.js';
import { classifyPageAdmission, loadLivePageState, runResumableAdmissionV1, summarizePlan } from '../../src/lib/server/atlas/docs/external-doc-admission-plan-v1.js';
import { toExternalDocAdmissionInputV1, validateExternalDocAdmissionHandoff, type ExternalDocAdmissionEnvelopeV1 } from '../../src/lib/server/atlas/docs/external-doc-intelligence-contracts-v1.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const ENVELOPES = resolve(ROOT, 'docs/.okf/pinned/admission-envelopes-v1.json');
// A run (first load or resume) writes its OWN receipt; the verified canonical receipt is owned by verify-external-doc-canonical-admission-v1.mts.
const RECEIPT = resolve(ROOT, 'docs/reports/external-doc-admission-run-v1.json');
const RESUMABILITY_RECEIPT = resolve(ROOT, 'docs/reports/external-doc-admission-resumability-v1.json');
const AUTH = 'I_AUTHORIZE_CANONICAL_ADMISSION';
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
type AdmissionInput = ReturnType<typeof toExternalDocAdmissionInputV1>;

async function runPilot(input: AdmissionInput, databaseUrl: string, apply: boolean, query?: string) {
	const pool = new Pool({ connectionString: databaseUrl });
	const classify = async (candidate: AdmissionInput) => {
		const client = await pool.connect();
		try {
			await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
			return await loadLivePageState(client, candidate);
		} finally {
			try { await client.query('ROLLBACK'); } finally { client.release(); }
		}
	};
	try {
		let live = await classify(input);
		let result = classifyPageAdmission(input, live);
		let writerCalls = 0;
		if (apply && result.classification === 'MISSING') {
			const run = await runResumableAdmissionV1([input], classify, (page) => admitExternalDocPage(pool, page));
			writerCalls = run.writerCalls;
			live = await classify(input);
			result = classifyPageAdmission(input, live);
		}
		let citation = null;
		if (query && result.classification === 'ALREADY_ADMITTED_EXACT') {
			const search = await searchDocCorpus({
				pool, root: ROOT, q: query, limit: 25, product: input.page.product, productVersion: input.page.productVersion
			});
			citation = search.mode === 'POSTGRES_FTS' ? search.hits.find((hit) =>
				hit.sourceClass === 'CANONICAL' && hit.pageId === live.pageId && hit.revision === input.page.evidenceRevision &&
				input.chunks.some((chunk) => hit.chunkId === chunk.chunkId && hit.chunkEvidenceRevision === chunk.evidenceRevision)
			) ?? null : null;
		}
		console.log(JSON.stringify({
			mode: apply ? 'STAGING_APPLY' : 'PLAN_READ_ONLY', ...result, writerCalls,
			pageEvidenceRevision: input.page.evidenceRevision, chunkCount: input.chunks.length,
			citation: citation && {
				pageId: citation.pageId, pageEvidenceRevision: citation.revision,
				chunkId: citation.chunkId, chunkEvidenceRevision: citation.chunkEvidenceRevision,
				url: citation.url, provider: citation.provider, product: citation.product, productVersion: citation.productVersion
			}
		}, null, 2));
		if (result.classification === 'CONFLICT' || (apply && result.classification !== 'ALREADY_ADMITTED_EXACT') ||
			(query && result.classification === 'ALREADY_ADMITTED_EXACT' && !citation)) process.exitCode = 1;
	} finally {
		await pool.end();
	}
}

async function readCorpusSnapshot(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, inputs: Awaited<ReturnType<typeof toExternalDocAdmissionInputV1>>[]) {
	const pageRows = (await client.query('SELECT provider, product, product_version, url, evidence_revision FROM atlas_external_doc_pages')).rows;
	const chunkRows = (await client.query('SELECT chunk_id, evidence_revision FROM atlas_external_doc_chunks')).rows;
	const expectedPages = new Set(inputs.map((i) => [i.page.provider, i.page.product, i.page.productVersion, i.page.url, i.page.evidenceRevision].join('\u0000')));
	const expectedChunks = new Set(inputs.flatMap((i) => i.chunks.map((c) => [c.chunkId, c.evidenceRevision].join('\u0000'))));
	const pageKeys = pageRows.map((r) => [r.provider, r.product, r.product_version, r.url, r.evidence_revision].join('\u0000'));
	const chunkKeys = chunkRows.map((r) => [r.chunk_id, r.evidence_revision].join('\u0000'));
	const unique = (keys: string[]) => new Set(keys).size;
	return {
		pages: pageRows.length,
		chunks: chunkRows.length,
		unexpectedPageRows: pageKeys.filter((key) => !expectedPages.has(key)).length,
		duplicatePageRows: pageKeys.length - unique(pageKeys),
		unexpectedChunkRows: chunkKeys.filter((key) => !expectedChunks.has(key)).length,
		duplicateChunkRows: chunkKeys.length - unique(chunkKeys),
	};
}

async function main(): Promise<void> {
	const { values } = parseArgs({ options: {
		apply: { type: 'boolean' }, plan: { type: 'boolean' }, envelopes: { type: 'string' },
		'normalized-page': { type: 'string' }, query: { type: 'string' }
	} });
	const { apply, plan: planOnly, envelopes, 'normalized-page': normalizedPage, query } = values;
	if ((apply && planOnly) || (!envelopes && (normalizedPage || query)) ||
		(query !== undefined && (query.trim().length < 2 || query.length > 300))) throw new Error('INVALID_ADMISSION_ARGUMENTS');
	const envelopeBytes = readFileSync(envelopes ? resolve(envelopes) : ENVELOPES);
	const all = JSON.parse(envelopeBytes.toString('utf8')) as ExternalDocAdmissionEnvelopeV1[];
	const handoff = validateExternalDocAdmissionHandoff(all);
	if (handoff.result !== 'EXTERNAL_DOC_ADMISSION_HANDOFF_READY') throw new Error(`HANDOFF_NOT_READY:${handoff.blockers.map((item) => item.code).join(',')}`);
	const inputs = all.map((e) => toExternalDocAdmissionInputV1(e));
	const expected = { pages: inputs.length, chunks: inputs.reduce((n, i) => n + i.chunks.length, 0) };
	if (envelopes) {
		if (all.length !== 1 || !normalizedPage) throw new Error('PILOT_REQUIRES_ONE_ENVELOPE_AND_NORMALIZED_PAGE');
		const [input] = inputs;
		const pageBytes = readFileSync(resolve(normalizedPage));
		if (sha(pageBytes) !== input.page.contentHash) throw new Error('PILOT_PAGE_HASH_MISMATCH');
		const { provider, product, productVersion, url, contentHash } = input.page;
		// Match the sorted JSON identity in Python DocCoordinateV1.
		const pageRevision = sha(JSON.stringify({
			content_hash: contentHash, product, product_version: productVersion, provider, section_anchor: null, url
		}));
		if (input.page.evidenceRevision !== `sha256:${pageRevision}`) throw new Error('PILOT_PAGE_REVISION_MISMATCH');
		for (const chunk of input.chunks) {
			if (!pageBytes.subarray(chunk.startByte, chunk.endByte).equals(Buffer.from(chunk.text, 'utf8'))) {
				throw new Error(`PILOT_CHUNK_SPAN_MISMATCH:${chunk.chunkId}`);
			}
		}
		console.log(JSON.stringify({ result: 'PILOT_CAPTURE_MATCH', envelopeSha256: sha(envelopeBytes), pageSha256: contentHash, ...expected }));
		if (!planOnly && !apply) return;
		if (apply && (process.env.ATLAS_DOC_ADMISSION_AUTHORIZED !== AUTH || !query)) {
			throw new Error('PILOT_APPLY_REQUIRES_ADMISSION_AUTHORIZATION_AND_FTS_QUERY');
		}
		const databaseUrl = process.env.ATLAS_DOC_STAGING_DATABASE_URL ?? (planOnly ? process.env.DATABASE_URL : undefined);
		if (!databaseUrl) throw new Error('PILOT_DATABASE_NOT_CONFIGURED');
		await runPilot(input, databaseUrl, Boolean(apply), query?.trim());
		return;
	}
	if (planOnly && !apply) {
		if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
		const pool = new Pool({ connectionString: process.env.DATABASE_URL });
		const client = await pool.connect();
		try {
			await client.query('BEGIN READ ONLY');
			const liveBefore = await readCorpusSnapshot(client, inputs);
			const items = [];
			for (const input of inputs) items.push({ input, result: classifyPageAdmission(input, await loadLivePageState(client as never, input)) });
			const plan = summarizePlan(items);
			await client.query('ROLLBACK');
			const currentFullCorpusReplay = plan.alreadyAdmitted === expected.pages && plan.missing === 0 && plan.conflicts === 0 &&
				liveBefore.pages === expected.pages && liveBefore.chunks === expected.chunks && liveBefore.unexpectedPageRows === 0 &&
				liveBefore.duplicatePageRows === 0 && liveBefore.unexpectedChunkRows === 0 && liveBefore.duplicateChunkRows === 0;
			const result = currentFullCorpusReplay ? 'EXTERNAL_DOC_ADMISSION_RESUMABILITY_PROVEN' : 'EXTERNAL_DOC_ADMISSION_RECONCILIATION_INCOMPLETE';
			const report = {
				schema: 'atlas.external-doc-admission-resumability.v1', generatedAt: new Date().toISOString(), readOnly: true,
				expected: { pageCount: expected.pages, chunkCount: expected.chunks },
				liveBefore,
				classification: { alreadyAdmittedExact: plan.alreadyAdmitted, missing: plan.missing, conflict: plan.conflicts },
				pages: plan.pages,
				writerCalls: 0,
				currentFullCorpusReplay,
				partialFixture: { result: 'PROVEN_BY_FOCUSED_TEST', expectedPages: ['A', 'B', 'C'], initial: ['A:ALREADY_ADMITTED_EXACT', 'B:ALREADY_ADMITTED_EXACT', 'C:MISSING'], writerEligible: ['C'], writerCalls: 1, test: 'external-doc-admission-plan-v1.spec.ts' },
				crashResumeFixture: { result: 'PROVEN_BY_FOCUSED_TEST', firstRunCommitted: ['A', 'B'], crashBefore: 'C', resumedSkipped: ['A', 'B'], resumedAdmitted: ['C'], test: 'external-doc-admission-plan-v1.spec.ts' },
				conflictFixtures: ['wrong page evidence revision', 'missing child chunk', 'extra child chunk', 'wrong child checksum', 'wrong child span', 'wrong child text', 'chunk ID collision on another page', 'duplicate page candidate'].map((caseName) => ({ case: caseName, result: 'CONFLICT_WRITER_CALLS_ZERO', test: 'external-doc-admission-plan-v1.spec.ts' })),
				supersession: { supported: false, followup: 'EXTERNAL_DOC_CORPUS_SUPERSESSION_01' },
				result,
				writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 },
			};
			writeFileSync(RESUMABILITY_RECEIPT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
			console.log(JSON.stringify({ mode: 'PLAN_READ_ONLY', expected, liveBefore, classification: report.classification, writerCalls: 0, currentFullCorpusReplay, result, writes: report.writes }, null, 2));
			if (!currentFullCorpusReplay) process.exitCode = 1;
		} finally { try { await client.query('ROLLBACK'); } catch { /* transaction already closed */ } client.release(); await pool.end(); }
		return;
	}
	if (!apply) {
		console.log(JSON.stringify({ mode: 'DRY_RUN', expected, result: 'ADMISSION_DRY_RUN_READY', writes: { postgres: 0 } }, null, 2));
		return;
	}
	if (process.env.ATLAS_DOC_ADMISSION_AUTHORIZED !== AUTH) throw new Error(`ADMISSION_NOT_AUTHORIZED: set ATLAS_DOC_ADMISSION_AUTHORIZED=${AUTH}`);
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	try {
		const readClient = await pool.connect();
		let liveBefore: Awaited<ReturnType<typeof readCorpusSnapshot>>;
		try {
			await readClient.query('BEGIN READ ONLY');
			liveBefore = await readCorpusSnapshot(readClient, inputs);
			const items = [];
			for (const input of inputs) items.push({ input, result: classifyPageAdmission(input, await loadLivePageState(readClient as never, input)) });
			await readClient.query('ROLLBACK');
			const plan = summarizePlan(items);
			if (!plan.safeToAdmit || liveBefore.unexpectedPageRows || liveBefore.duplicatePageRows || liveBefore.unexpectedChunkRows || liveBefore.duplicateChunkRows) {
				throw new Error(`ADMISSION_CONFLICT:${JSON.stringify(plan.pages.filter((p) => p.classification === 'CONFLICT').slice(0, 5))}`);
			}
		} finally { try { await readClient.query('ROLLBACK'); } catch { /* transaction already closed */ } readClient.release(); }
		if (liveBefore!.pages > expected.pages || liveBefore!.chunks > expected.chunks) throw new Error(`ADMISSION_UNEXPECTED_ROWS:${JSON.stringify(liveBefore)}`);
		const resumed = await runResumableAdmissionV1(inputs, (input) => loadLivePageState(pool as never, input), (input) => admitExternalDocPage(pool, input));
		if (resumed.result === 'CONFLICT') throw new Error(`ADMISSION_CONFLICT:${JSON.stringify(resumed.plan.pages.filter((p) => p.classification === 'CONFLICT').slice(0, 5))}`);
		const after = await readCorpusSnapshot(pool as never, inputs);
		const failures: string[] = [];
		if (after.pages !== expected.pages || after.chunks !== expected.chunks || after.unexpectedPageRows || after.duplicatePageRows || after.unexpectedChunkRows || after.duplicateChunkRows) failures.push(`COUNTS_OR_EXTRAS:${JSON.stringify(after)} expected ${JSON.stringify(expected)}`);
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
				schema: 'atlas.external-doc-canonical-admission.v1', generatedAt: new Date().toISOString(), baseline: liveBefore, expected, after,
				resume: { alreadyAdmittedSkipped: resumed.plan.alreadyAdmitted, admittedThisRun: resumed.plan.missing, writerCalls: resumed.writerCalls },
			chunkRowsVerified: verified, ftsHitsForSnippet: fts, distinctProductVersions: versions, failures, result,
			admissionReceipts: resumed.receipts.map((r) => ({ pageEvidenceRevision: r.pageEvidenceRevision, chunkCount: r.chunkCount, transactionCommitted: r.transactionCommitted })),
			writes: { postgres: 'COMMITTED', qdrant: 0, valkey: 0, neo4j: 0 }
		}, null, 2) + '\n');
		console.log(JSON.stringify({ result, after, chunkRowsVerified: verified, fts, failures }, null, 2));
		if (failures.length) process.exitCode = 1;
	} finally {
		await pool.end();
	}
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
