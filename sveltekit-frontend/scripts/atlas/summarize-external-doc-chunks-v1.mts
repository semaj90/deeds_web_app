#!/usr/bin/env node
/**
 * EXTERNAL_DOC_SUMMARY_WRITER_01: Ornith (llama-server :8090, NOT Ollama) SUMMARY analyses for canonical external-doc chunks, written to atlas_external_doc_analyses.
 * Derived, non-canonical, APPEND-ONLY (ON CONFLICT (analysis_id) DO NOTHING). Never writes atlas_external_doc_chunks. No Qdrant/Valkey/Neo4j/Graphify.
 *
 * Modes:
 *   (default)           DRY RUN: real Ornith calls on a bounded sample, validates every row against ExternalDocAnalysisV1, 0 database writes.
 *   --rollback-canary   inserts the sample rows inside ONE transaction, reads them back, then ROLLS BACK (proves the writer; leaves 0 rows).
 *   --apply --limit N   BOUNDED persistent write of N chunks (needs env ATLAS_DOC_SUMMARY_AUTHORIZED=I_AUTHORIZE_EXTERNAL_DOC_SUMMARIES). A full-corpus run additionally needs the explicit flag --all.
 * ADMISSION (VAL10B_SUMMARY_PERSISTENCE_ADMISSION_01): in EVERY mode each generated summary is run through python/atlas_summary_admission_v1.py (canonical chunk re-read, deterministic checks,
 *   Ornith judge, VAL-09) and only summaries whose claims are ALL ADMIT and whose sealed report binds this exact chunk revision and this exact text hash are ever inserted. --limit is a ceiling, not a target.
 *   If the admission process fails, nothing is written.
 * Flags: --limit N (sample size, default 3). Run from sveltekit-frontend/:  npx tsx scripts/atlas/summarize-external-doc-chunks-v1.mts [--rollback-canary|--apply] [--limit N]
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { partitionByAdmissionV1 } from '../../src/lib/server/atlas/docs/summary-persistence-admission-v1.js';
import { ExternalDocAnalysisV1Schema, externalDocAnalysisId, type ExternalDocAnalysisV1 } from '../../src/lib/server/atlas/docs/external-doc-intelligence-contracts-v1.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const LLAMA = process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090';
const AUTH = 'I_AUTHORIZE_EXTERNAL_DOC_SUMMARIES';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const canary = args.includes('--rollback-canary');
const limIdx = args.indexOf('--limit');
const sample = limIdx >= 0 ? Number(args[limIdx + 1]) : 3;
const all = args.includes('--all');

const PRODUCER_ID = 'atlas-external-doc-summarizer';
const PRODUCER_REVISION = 'external-doc-summary-writer-v1';
const SYSTEM_PROMPT = 'You summarize one chunk of technical documentation. Write 1-3 plain sentences that state only what the chunk says. Keep exact identifiers, setting names, function names and version numbers verbatim. Do not add facts, advice, or markdown headings.';
const PROMPT_NAME = 'external-doc-summary-prompt-v1';
const USER_TEMPLATE = 'Product: {product} {productVersion}\nPage: {title}\nSection: {headingPath}\nChunk evidence: {chunkEvidenceRevision}\nText:\n{text}';
const PROMPT_REVISION = `${PROMPT_NAME}@sha256:${createHash('sha256').update(SYSTEM_PROMPT + '|' + USER_TEMPLATE + '|temp0.2|max300|seed1729').digest('hex')}`;
const MAX_SUMMARY_CHARS = 1500;
const PLACEHOLDER = /^(n\/a|none|summary:?|i (cannot|can't|am unable)|as an ai)/i;
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

interface Chunk { chunk_id: string; evidence_revision: string; text: string; title: string; product: string; product_version: string; heading_path: string[] }
const userContent = (c: Chunk) => USER_TEMPLATE.replace('{product}', c.product).replace('{productVersion}', c.product_version).replace('{title}', c.title).replace('{headingPath}', (c.heading_path ?? []).join(' > ') || 'none').replace('{chunkEvidenceRevision}', c.evidence_revision).replace('{text}', () => c.text);

async function resolveModel(): Promise<{ modelId: string; modelRevision: string }> {
	const props = await (await fetch(`${LLAMA}/props`)).json() as { model_alias?: string; model_path?: string; build_info?: string };
	const models = await (await fetch(`${LLAMA}/v1/models`)).json() as { data?: { id: string }[] };
	const listed = models.data?.map((m) => m.id) ?? [];
	// Fail closed: the resolved model must be the approved Ornith 1.5 family from the live server (not a file name or label), and /props and /v1/models must agree.
	if (!props.model_alias || !/^ornith-1[._-]?5/i.test(props.model_alias) || !listed.includes(props.model_alias)) throw new Error(`SUMMARY_MODEL_NOT_APPROVED:${props.model_alias ?? 'unresolved'}:${listed.join(',')}`);
	const file = (props.model_path ?? '').split(/[\\/]/).pop() ?? 'unknown.gguf';
	// The model FILE digest is not computed here (multi-GB); the revision pins alias + gguf file name + llama.cpp build as reported by the live server.
	return { modelId: props.model_alias, modelRevision: `${props.model_alias}@${file}@${props.build_info ?? 'unknown-build'}` };
}

async function summarize(chunk: Chunk, modelId: string): Promise<{ text: string; finish: string; tokens: number }> {
	const res = await fetch(`${LLAMA}/v1/chat/completions`, {
		method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(90_000),
		body: JSON.stringify({ model: modelId, temperature: 0.2, max_tokens: 300, stream: false, seed: 1729,
			messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent(chunk) }] })
	});
	if (!res.ok) throw new Error(`LLAMA_HTTP_${res.status}`);
	const body = await res.json() as { choices: { message: { content?: string }; finish_reason: string }[]; usage?: { completion_tokens?: number } };
	const raw = body.choices?.[0]?.message?.content ?? '';
	// Same contamination sanitizer the summary pipeline uses; empty or truncated output fails closed.
	const text = raw.replace(/<end_of_turn>|<start_of_turn>|<\|channel>|<\/?thinking>|<\|endthinking>/g, '').trim();
	const finish = body.choices?.[0]?.finish_reason ?? 'unknown';
	if (!text || text.length < 20) throw new Error('SUMMARY_EMPTY_OR_TOO_SHORT');
	if (text.length > MAX_SUMMARY_CHARS) throw new Error('SUMMARY_TOO_LONG');
	if (PLACEHOLDER.test(text) || text.includes('�')) throw new Error('SUMMARY_PLACEHOLDER_OR_INVALID_UTF8');
	if (finish !== 'stop') throw new Error(`SUMMARY_NOT_COMPLETE:${finish}`);
	return { text, finish, tokens: body.usage?.completion_tokens ?? 0 };
}

function toAnalysis(chunk: Chunk, out: { text: string; finish: string; tokens: number }, model: { modelId: string; modelRevision: string }): ExternalDocAnalysisV1 {
	const inputChecksum = sha(`${PROMPT_REVISION}\n${userContent(chunk)}`);
	const base = { chunkEvidenceRevision: chunk.evidence_revision, analysisType: 'SUMMARY' as const, producerId: PRODUCER_ID, producerRevision: PRODUCER_REVISION, modelId: model.modelId, modelRevision: model.modelRevision, promptRevision: PROMPT_REVISION, inputChecksum };
	return ExternalDocAnalysisV1Schema.parse({
		schema: 'atlas.external-doc-analysis.v1', analysisId: externalDocAnalysisId(base), chunkId: chunk.chunk_id, ...base, outputChecksum: sha(out.text), summaryText: out.text,
		metadata: { backend: 'llama-server', baseUrl: LLAMA, temperature: 0.2, seed: 1729, maxTokens: 300, finishReason: out.finish, completionTokens: out.tokens, product: chunk.product, productVersion: chunk.product_version },
		canonicalAuthority: false, createdAt: new Date().toISOString()
	});
}

const INSERT = `INSERT INTO atlas_external_doc_analyses (analysis_id, chunk_id, chunk_evidence_revision, analysis_type, producer_id, producer_revision, model_id, model_revision, prompt_revision,
	input_checksum, output_checksum, summary_text, entities, relations, metadata, canonical_authority) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'[]','[]',$13,false) ON CONFLICT (analysis_id) DO NOTHING`;
const params = (a: ExternalDocAnalysisV1) => [a.analysisId, a.chunkId, a.chunkEvidenceRevision, a.analysisType, a.producerId, a.producerRevision, a.modelId, a.modelRevision, a.promptRevision, a.inputChecksum, a.outputChecksum, a.summaryText, JSON.stringify(a.metadata)];

function runAdmission(items: { chunkId: string; chunkEvidenceRevision: string; summaryText: string }[]): Map<string, unknown> {
	if (items.length === 0) return new Map();
	const r = spawnSync('python', [resolve(ROOT, 'python/atlas_summary_admission_v1.py')], { cwd: resolve(ROOT, 'python'), input: JSON.stringify({ items }), encoding: 'utf8', timeout: 1_800_000, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
	if (r.error || r.status !== 0) throw new Error(`ADMISSION_PROCESS_FAILED:${r.error?.message ?? `exit ${r.status}: ${(r.stderr ?? '').slice(-300)}`}`);
	const reports = (JSON.parse(r.stdout) as { reports: { chunkId: string; chunkEvidenceRevision: string }[] }).reports;
	return new Map(reports.map((rep) => [`${rep.chunkId}|${rep.chunkEvidenceRevision}`, rep]));
}

async function main(): Promise<void> {
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
	if (apply && !all && limIdx < 0) throw new Error('APPLY_REQUIRES_LIMIT: use --apply --limit N (bounded) or --apply --all (full corpus, separately authorized)');
	if (apply && process.env.ATLAS_DOC_SUMMARY_AUTHORIZED !== AUTH) throw new Error(`SUMMARIES_NOT_AUTHORIZED: set ATLAS_DOC_SUMMARY_AUTHORIZED=${AUTH}`);
	const model = await resolveModel();
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	const client = await pool.connect();
	const failures: string[] = [];
	try {
		const before = (await client.query('SELECT count(*)::int n FROM atlas_external_doc_analyses')).rows[0].n as number;
		// Stratified sample for dry-run/canary (spread over products); apply covers every chunk not yet summarized by this exact producer/model/prompt.
		const rows = (await client.query(
			`SELECT c.chunk_id, c.evidence_revision, c.text, c.heading_path, p.title, p.product, p.product_version FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id
			  WHERE NOT EXISTS (SELECT 1 FROM atlas_external_doc_analyses a WHERE a.chunk_evidence_revision = c.evidence_revision AND a.analysis_type = 'SUMMARY'
			        AND a.producer_id = $1 AND a.producer_revision = $2 AND a.model_revision = $3 AND a.prompt_revision = $4)
			  ORDER BY c.chunk_id`, [PRODUCER_ID, PRODUCER_REVISION, model.modelRevision, PROMPT_REVISION])).rows as Chunk[];
		const step = Math.max(1, Math.floor(rows.length / Math.max(sample, 1)));
		const work = apply && all ? rows : rows.filter((_, i) => i % step === 0).slice(0, sample);
		const analyses: ExternalDocAnalysisV1[] = [];
		const latencies: number[] = [];
		for (const chunk of work) {
			const t0 = Date.now();
			try { analyses.push(toAnalysis(chunk, await summarize(chunk, model.modelId), model)); latencies.push(Date.now() - t0); if (apply && analyses.length % 50 === 0) console.error(`progress ${analyses.length}/${work.length}`); }
			catch (e) { failures.push(`${chunk.chunk_id}:${e instanceof Error ? e.message : e}`); }
		}
		// Admission gate: the writer enforces eligibility itself, on the exact in-memory text it is about to insert (no trust in a caller-supplied preflight).
		const keyOf = (a: { chunkId: string; chunkEvidenceRevision: string }) => `${a.chunkId}|${a.chunkEvidenceRevision}`;
		const reports = runAdmission(analyses.map((a) => ({ chunkId: a.chunkId, chunkEvidenceRevision: a.chunkEvidenceRevision, summaryText: a.summaryText ?? '' })));
		const { admitted, rejected } = partitionByAdmissionV1(analyses.map((a) => ({ chunkId: a.chunkId, chunkEvidenceRevision: a.chunkEvidenceRevision, outputSha256: a.outputChecksum, analysis: a })), reports, keyOf);
		const admittedAnalyses = admitted.map((c) => { const rep = reports.get(keyOf(c)) as { admissionChecksum: string; resolverRevision: string; claimCount: number; splitterRevision: string }; return { ...c.analysis, metadata: { ...c.analysis.metadata, admission: { admissionChecksum: rep.admissionChecksum, resolverRevision: rep.resolverRevision, claimCount: rep.claimCount, splitterRevision: rep.splitterRevision } } } as ExternalDocAnalysisV1; });
		const admissionSummary = { evaluated: analyses.length, admitted: admittedAnalyses.length, rejected: rejected.map((x) => ({ chunkId: x.candidate.chunkId, chunkEvidenceRevision: x.candidate.chunkEvidenceRevision, reasons: x.reasons })), ceiling: apply ? sample : null };
		let written = 0; let readbackOk: boolean | null = null; let afterRollback: number | null = null;
		if (canary || apply) {
			await client.query('BEGIN');
			for (const a of admittedAnalyses) written += (await client.query(INSERT, params(a))).rowCount ?? 0;
			const rb = (await client.query(`SELECT analysis_id, output_checksum, summary_text, canonical_authority FROM atlas_external_doc_analyses WHERE analysis_id = ANY($1::text[])`, [admittedAnalyses.map((a) => a.analysisId)])).rows;
			readbackOk = rb.length === admittedAnalyses.length && rb.every((r) => admittedAnalyses.some((a) => a.analysisId === r.analysis_id && a.outputChecksum === r.output_checksum && sha(r.summary_text) === r.output_checksum) && r.canonical_authority === false);
			if (!readbackOk) failures.push('READBACK_MISMATCH');
			if (canary && !apply) { await client.query('ROLLBACK'); afterRollback = (await client.query('SELECT count(*)::int n FROM atlas_external_doc_analyses')).rows[0].n as number; if (afterRollback !== before) failures.push('ROLLBACK_NOT_CLEAN'); }
			else if (!readbackOk) await client.query('ROLLBACK'); else await client.query('COMMIT'); // generation failures are reported (a rerun resumes them); only a readback mismatch aborts the write
		}
		const mode = apply ? 'APPLY' : canary ? 'ROLLBACK_CANARY' : 'DRY_RUN';
		const receipt = {
			schema: 'atlas.external-doc-summary-writer.v1', generatedAt: new Date().toISOString(), mode, backend: { kind: 'llama-server (NOT Ollama)', url: LLAMA, ...model },
			producer: { id: PRODUCER_ID, revision: PRODUCER_REVISION, promptRevision: PROMPT_REVISION }, admission: admissionSummary, analysesBefore: before, considered: work.length, generated: analyses.length, admitted: admittedAnalyses.length, written, readbackOk, afterRollback,
			medianLatencyMs: latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)] ?? null, failures,
			samples: analyses.slice(0, 3).map((a) => ({ chunkId: a.chunkId, chunkEvidenceRevision: a.chunkEvidenceRevision, analysisId: a.analysisId, summary: a.summaryText })),
			writes: { postgres: apply ? { table: 'atlas_external_doc_analyses', rows: written } : canary ? 'ROLLED_BACK' : 0, qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 },
			result: failures.length ? 'EXTERNAL_DOC_SUMMARY_WRITER_FAILED' : apply ? 'EXTERNAL_DOC_SUMMARIES_WRITTEN' : canary ? 'EXTERNAL_DOC_SUMMARY_WRITER_ROLLBACK_PROVEN' : 'EXTERNAL_DOC_SUMMARY_WRITER_DRY_RUN_READY'
		};
		writeFileSync(resolve(ROOT, `docs/reports/external-doc-summary-writer-${mode.toLowerCase().replace('_', '-')}-v1.json`), JSON.stringify(receipt, null, 2) + '\n');
		console.log(JSON.stringify({ result: receipt.result, mode, before, considered: work.length, generated: analyses.length, written, readbackOk, afterRollback, medianLatencyMs: receipt.medianLatencyMs, failures, samples: receipt.samples }, null, 2));
		if (failures.length) process.exitCode = 1;
	} finally { client.release(); await pool.end(); }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
