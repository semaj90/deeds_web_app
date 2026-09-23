#!/usr/bin/env node
/**
 * EXTERNAL_DOC_SUMMARY_WRITER_01: Ornith (llama-server :8090, NOT Ollama) SUMMARY analyses for canonical external-doc chunks, written to atlas_external_doc_analyses.
 * Derived, non-canonical, APPEND-ONLY (ON CONFLICT (analysis_id) DO NOTHING). Never writes atlas_external_doc_chunks. No Qdrant/Valkey/Neo4j/Graphify.
 *
 * Modes:
 *   (default)           DRY RUN: real Ornith calls on a bounded sample, validates every row against ExternalDocAnalysisV1, 0 database writes.
 *   --rollback-canary   inserts the sample rows inside ONE transaction, reads them back, then ROLLS BACK (proves the writer; leaves 0 rows).
 *   --apply             needs env ATLAS_DOC_SUMMARY_AUTHORIZED=I_AUTHORIZE_EXTERNAL_DOC_SUMMARIES; writes for every chunk that has no SUMMARY for this producer/model/prompt.
 * Flags: --limit N (sample size, default 3). Run from sveltekit-frontend/:  npx tsx scripts/atlas/summarize-external-doc-chunks-v1.mts [--rollback-canary|--apply] [--limit N]
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { ExternalDocAnalysisV1Schema, externalDocAnalysisId, type ExternalDocAnalysisV1 } from '../../src/lib/server/atlas/docs/external-doc-intelligence-contracts-v1.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const LLAMA = process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090';
const AUTH = 'I_AUTHORIZE_EXTERNAL_DOC_SUMMARIES';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const canary = args.includes('--rollback-canary');
const limIdx = args.indexOf('--limit');
const sample = limIdx >= 0 ? Number(args[limIdx + 1]) : 3;

const PRODUCER_ID = 'atlas-external-doc-summarizer';
const PRODUCER_REVISION = 'external-doc-summary-writer-v1';
const SYSTEM_PROMPT = 'You summarize one chunk of technical documentation. Write 1-3 plain sentences that state only what the chunk says. Keep exact identifiers, setting names, function names and version numbers verbatim. Do not add facts, advice, or markdown headings.';
const PROMPT_REVISION = `sha256:${createHash('sha256').update(SYSTEM_PROMPT + '|user:"Title: {title}\\nChunk:\\n{text}"|temp0.2|max300').digest('hex')}`;
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

interface Chunk { chunk_id: string; evidence_revision: string; text: string; title: string; product: string; product_version: string }

async function resolveModel(): Promise<{ modelId: string; modelRevision: string }> {
	const props = await (await fetch(`${LLAMA}/props`)).json() as { model_alias?: string; model_path?: string; build_info?: string };
	if (!props.model_alias) throw new Error('LLAMA_SERVER_MODEL_UNRESOLVED');
	const file = (props.model_path ?? '').split(/[\\/]/).pop() ?? 'unknown.gguf';
	// The model FILE digest is not computed here (multi-GB); the revision pins alias + gguf file name + llama.cpp build as reported by the live server.
	return { modelId: props.model_alias, modelRevision: `${props.model_alias}@${file}@${props.build_info ?? 'unknown-build'}` };
}

async function summarize(chunk: Chunk, modelId: string): Promise<{ text: string; finish: string; tokens: number }> {
	const res = await fetch(`${LLAMA}/v1/chat/completions`, {
		method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(90_000),
		body: JSON.stringify({ model: modelId, temperature: 0.2, max_tokens: 300, stream: false, seed: 1729,
			messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: `Title: ${chunk.title}\nChunk:\n${chunk.text}` }] })
	});
	if (!res.ok) throw new Error(`LLAMA_HTTP_${res.status}`);
	const body = await res.json() as { choices: { message: { content?: string }; finish_reason: string }[]; usage?: { completion_tokens?: number } };
	const raw = body.choices?.[0]?.message?.content ?? '';
	// Same contamination sanitizer the summary pipeline uses; empty or truncated output fails closed.
	const text = raw.replace(/<end_of_turn>|<start_of_turn>|<\|channel>|<\/?thinking>|<\|endthinking>/g, '').trim();
	const finish = body.choices?.[0]?.finish_reason ?? 'unknown';
	if (!text || text.length < 20) throw new Error('SUMMARY_EMPTY_OR_TOO_SHORT');
	if (finish !== 'stop') throw new Error(`SUMMARY_NOT_COMPLETE:${finish}`);
	return { text, finish, tokens: body.usage?.completion_tokens ?? 0 };
}

function toAnalysis(chunk: Chunk, out: { text: string; finish: string; tokens: number }, model: { modelId: string; modelRevision: string }): ExternalDocAnalysisV1 {
	const inputChecksum = sha(`${PROMPT_REVISION}\n${chunk.title}\n${chunk.text}`);
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

async function main(): Promise<void> {
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
	if (apply && process.env.ATLAS_DOC_SUMMARY_AUTHORIZED !== AUTH) throw new Error(`SUMMARIES_NOT_AUTHORIZED: set ATLAS_DOC_SUMMARY_AUTHORIZED=${AUTH}`);
	const model = await resolveModel();
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	const client = await pool.connect();
	const failures: string[] = [];
	try {
		const before = (await client.query('SELECT count(*)::int n FROM atlas_external_doc_analyses')).rows[0].n as number;
		// Stratified sample for dry-run/canary (spread over products); apply covers every chunk not yet summarized by this exact producer/model/prompt.
		const rows = (await client.query(
			`SELECT c.chunk_id, c.evidence_revision, c.text, p.title, p.product, p.product_version FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id
			  WHERE NOT EXISTS (SELECT 1 FROM atlas_external_doc_analyses a WHERE a.chunk_evidence_revision = c.evidence_revision AND a.analysis_type = 'SUMMARY'
			        AND a.producer_id = $1 AND a.producer_revision = $2 AND a.model_revision = $3 AND a.prompt_revision = $4)
			  ORDER BY c.chunk_id`, [PRODUCER_ID, PRODUCER_REVISION, model.modelRevision, PROMPT_REVISION])).rows as Chunk[];
		const step = Math.max(1, Math.floor(rows.length / Math.max(sample, 1)));
		const work = apply ? rows : rows.filter((_, i) => i % step === 0).slice(0, sample);
		const analyses: ExternalDocAnalysisV1[] = [];
		const latencies: number[] = [];
		for (const chunk of work) {
			const t0 = Date.now();
			try { analyses.push(toAnalysis(chunk, await summarize(chunk, model.modelId), model)); latencies.push(Date.now() - t0); }
			catch (e) { failures.push(`${chunk.chunk_id}:${e instanceof Error ? e.message : e}`); }
		}
		let written = 0; let readbackOk: boolean | null = null; let afterRollback: number | null = null;
		if (canary || apply) {
			await client.query('BEGIN');
			for (const a of analyses) written += (await client.query(INSERT, params(a))).rowCount ?? 0;
			const rb = (await client.query(`SELECT analysis_id, output_checksum, summary_text, canonical_authority FROM atlas_external_doc_analyses WHERE analysis_id = ANY($1::text[])`, [analyses.map((a) => a.analysisId)])).rows;
			readbackOk = rb.length === analyses.length && rb.every((r) => analyses.some((a) => a.analysisId === r.analysis_id && a.outputChecksum === r.output_checksum && sha(r.summary_text) === r.output_checksum) && r.canonical_authority === false);
			if (!readbackOk) failures.push('READBACK_MISMATCH');
			if (canary && !apply) { await client.query('ROLLBACK'); afterRollback = (await client.query('SELECT count(*)::int n FROM atlas_external_doc_analyses')).rows[0].n as number; if (afterRollback !== before) failures.push('ROLLBACK_NOT_CLEAN'); }
			else if (failures.length) await client.query('ROLLBACK'); else await client.query('COMMIT');
		}
		const mode = apply ? 'APPLY' : canary ? 'ROLLBACK_CANARY' : 'DRY_RUN';
		const receipt = {
			schema: 'atlas.external-doc-summary-writer.v1', generatedAt: new Date().toISOString(), mode, backend: { kind: 'llama-server (NOT Ollama)', url: LLAMA, ...model },
			producer: { id: PRODUCER_ID, revision: PRODUCER_REVISION, promptRevision: PROMPT_REVISION }, analysesBefore: before, considered: work.length, generated: analyses.length, written, readbackOk, afterRollback,
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
